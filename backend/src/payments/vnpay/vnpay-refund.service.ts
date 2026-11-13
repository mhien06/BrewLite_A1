import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  formatVnpayDate,
  VnpayRefundClient,
  type VnpayRefundOutcome,
  type VnpayRefundResult,
} from './vnpay-refund.client.js';

const CHECK_INTERVAL_MS = 60_000;

@Injectable()
export class VnpayRefundService {
  private readonly logger = new Logger(VnpayRefundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: VnpayRefundClient,
  ) {}

  async processRefunds(now = new Date()): Promise<void> {
    const eligible = await this.prisma.refund.findMany({
      where: {
        status: { in: ['PENDING', 'PROCESSING', 'NEEDS_REVIEW'] },
        OR: [
          { checkedAt: null },
          { checkedAt: { lte: new Date(now.getTime() - CHECK_INTERVAL_MS) } },
        ],
      },
      include: { payment: true },
      orderBy: [{ checkedAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
      take: 20,
    });

    for (const refund of eligible) {
      const payment = refund.payment;
      if (
        payment.method !== 'VNPAY' ||
        payment.status !== 'PAID' ||
        !payment.providerTxnRef ||
        !Number.isSafeInteger(refund.amount) ||
        refund.amount <= 0 ||
        refund.amount !== payment.amount
      ) {
        await this.markNeedsReview(
          refund.id,
          now,
          'Giao dịch nguồn hoặc số tiền hoàn không hợp lệ; cần đối soát thủ công.',
        );
        continue;
      }

      const previousStatus = refund.status;
      const type = previousStatus === 'PENDING' ? 'REFUND' : 'QUERY';
      const requestId = randomBytes(16).toString('hex');
      const claimed = await this.prisma.refund.updateMany({
        where: {
          id: refund.id,
          status: previousStatus,
          checkedAt: refund.checkedAt,
        },
        data: {
          status: 'PROCESSING',
          checkedAt: now,
          ...(type === 'REFUND'
            ? {
                requestId,
                submittedAt: now,
              }
            : {}),
        },
      });
      if (!claimed.count) continue;

      let attemptId: number | undefined;
      try {
        const attemptNumber =
          (await this.prisma.refundAttempt.count({
            where: { refundId: refund.id },
          })) + 1;
        const attempt = await this.prisma.refundAttempt.create({
          data: {
            refundId: refund.id,
            attemptNumber,
            type,
            status: 'STARTED',
            requestId,
            transactionRef: payment.providerTxnRef,
            transactionNo: payment.providerTransactionNo,
            transactionDate: payment.createdAt,
            amount: refund.amount,
            transactionType: type === 'REFUND' ? '02' : null,
            initiatedById: null,
            startedAt: now,
          },
          select: { id: true },
        });
        attemptId = attempt.id;

        const common = {
          txnRef: payment.providerTxnRef,
          transactionDate: formatVnpayDate(payment.createdAt),
          ipAddress: process.env.VNPAY_SERVER_IP || '127.0.0.1',
          orderInfo: `Hoan tien don ${refund.orderId}`,
          requestId,
          now,
        };
        const result =
          type === 'REFUND'
            ? await this.gateway.requestRefund({
                ...common,
                amount: refund.amount,
                transactionNo: payment.providerTransactionNo,
                createdBy: 'BrewLite',
              })
            : await this.gateway.queryTransaction({
                ...common,
                transactionNo: payment.providerTransactionNo,
                expectedAmount: payment.amount,
              });

        await this.recordResult(refund.id, attempt.id, result, now, type === 'REFUND');
      } catch (error) {
        // An external request may have succeeded despite a timeout or transport error.
        await this.markNeedsReview(
          refund.id,
          now,
          error instanceof Error
            ? error.message
            : 'Không xác định được kết quả từ VNPay.',
          attemptId,
        );
      }
    }
  }

  private async recordResult(
    refundId: number,
    attemptId: number,
    result: VnpayRefundResult,
    now: Date,
    submitted: boolean,
  ) {
    const confirmed = result.outcome === 'COMPLETED';

    await this.prisma.$transaction(async (tx) => {
      const status = this.refundStatus(result.outcome, submitted);
      const errorMessage = this.errorMessage(
        result.outcome,
        submitted,
        result.message,
      );

      await tx.refundAttempt.update({
        where: { id: attemptId },
        data: {
          status: this.attemptStatus(result.outcome),
          responseId: result.responseId || null,
          responseCode: result.responseCode || null,
          responseMessage: result.message || null,
          responseTransactionNo: result.transactionNo || null,
          responsePayDate: result.payDate || null,
          responseTransactionStatus: result.transactionStatus || null,
          errorMessage,
          completedAt: now,
        },
      });
      await tx.refund.updateMany({
        where: { id: refundId, status: 'PROCESSING', checkedAt: now },
        data: {
          status,
          completedAt: confirmed ? now : null,
          lastError: errorMessage,
        },
      });
    });
  }

  private refundStatus(
    outcome: VnpayRefundOutcome,
    submitted: boolean,
  ): 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'NEEDS_REVIEW' {
    if (outcome === 'COMPLETED') return 'SUCCEEDED';
    if (outcome === 'REJECTED') return submitted ? 'NEEDS_REVIEW' : 'FAILED';
    if (outcome === 'ACCEPTED') return 'PROCESSING';
    return 'NEEDS_REVIEW';
  }

  private attemptStatus(
    outcome: VnpayRefundOutcome,
  ): 'CONFIRMED' | 'REJECTED' | 'AMBIGUOUS' {
    if (outcome === 'REJECTED') return 'REJECTED';
    if (outcome === 'UNKNOWN') return 'AMBIGUOUS';
    return 'CONFIRMED';
  }

  private errorMessage(
    outcome: VnpayRefundOutcome,
    submitted: boolean,
    providerMessage: string,
  ): string | null {
    if (outcome === 'COMPLETED' || outcome === 'ACCEPTED') return null;
    if (outcome === 'REJECTED') {
      return (
        providerMessage ||
        (submitted
          ? 'VNPay từ chối yêu cầu; hệ thống sẽ đối soát trước khi thử lại.'
          : 'VNPay xác nhận từ chối yêu cầu hoàn tiền.')
      );
    }
    if (outcome === 'ORIGINAL_PAYMENT_CONFIRMED') {
      return 'QueryDR chỉ xác nhận giao dịch thanh toán gốc, không chứng minh chưa có Refund; hệ thống không tự gửi lại để tránh hoàn trùng.';
    }
    return (
      providerMessage ||
      'Chưa xác định được kết quả hoàn tiền; hệ thống sẽ tiếp tục đối soát.'
    );
  }

  private async markNeedsReview(
    id: number,
    now: Date,
    message: string,
    attemptId?: number,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.refund.updateMany({
        where: {
          id,
          status: { in: ['PENDING', 'PROCESSING', 'NEEDS_REVIEW'] },
        },
        data: {
          status: 'NEEDS_REVIEW',
          checkedAt: now,
          lastError: message.slice(0, 1000),
        },
      });
      if (attemptId) {
        await tx.refundAttempt.updateMany({
          where: { id: attemptId, status: 'STARTED' },
          data: {
            status: 'AMBIGUOUS',
            errorMessage: message.slice(0, 1000),
            completedAt: now,
          },
        });
      }
    });
    this.logger.warn(`Refund #${id} needs reconciliation: ${message}`);
  }
}
