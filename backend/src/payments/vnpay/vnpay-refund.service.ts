import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { VnpayTransactionApiService } from './vnpay-transaction-api.service.js';
import type { VnpayParams } from './vnpay-signature.js';

const CHECK_INTERVAL_MS = 60_000;
const DEFINITIVE_REJECTIONS = new Set(['02', '03', '91', '95', '97']);

@Injectable()
export class VnpayRefundService {
  private readonly logger = new Logger(VnpayRefundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: VnpayTransactionApiService,
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
                retryRequestedById: null,
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
            initiatedById:
              type === 'REFUND'
                ? (refund.retryRequestedById ?? refund.requestedById)
                : null,
            startedAt: now,
          },
          select: { id: true },
        });
        attemptId = attempt.id;

        const common = {
          txnRef: payment.providerTxnRef,
          transactionNo: payment.providerTransactionNo,
          // VNPay expects the original vnp_CreateDate, not vnp_PayDate.
          transactionDate: payment.createdAt,
          ipAddress: process.env.VNPAY_SERVER_IP || '127.0.0.1',
        };
        const result =
          type === 'REFUND'
            ? await this.gateway.refundTransaction(
                {
                  ...common,
                  amount: refund.amount,
                  createdBy: 'BrewLite',
                  requestId,
                  transactionType: '02',
                },
                now,
              )
            : await this.gateway.queryTransaction(
                {
                  ...common,
                  expectedAmount: payment.amount,
                  requestId,
                },
                now,
              );

        await this.recordResult(refund.id, attempt.id, result, now, type === 'REFUND');
      } catch (error) {
        // Timeout/network errors are ambiguous: VNPay may already have accepted
        // the request. Preserve the attempt and never automatically send again.
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

  async retryRejectedRefund(id: number, actorId: number) {
    const refund = await this.prisma.refund.findFirst({
      where: {
        id,
        status: 'FAILED',
        payment: { method: 'VNPAY', status: 'PAID' },
      },
      select: { id: true },
    });
    if (!refund) {
      throw new ConflictException(
        'Chỉ có thể gửi lại yêu cầu đã bị VNPay từ chối rõ ràng.',
      );
    }

    const result = await this.prisma.refund.updateMany({
      where: { id, status: 'FAILED' },
      data: {
        status: 'PENDING',
        requestId: null,
        retryRequestedById: actorId,
        checkedAt: null,
        submittedAt: null,
        completedAt: null,
        lastError: null,
      },
    });
    if (!result.count) {
      throw new ConflictException('Yêu cầu hoàn tiền vừa được thay đổi.');
    }
    return {
      message: 'Đã đưa yêu cầu hoàn tiền bị từ chối vào hàng đợi gửi lại.',
    };
  }

  private async recordResult(
    refundId: number,
    attemptId: number,
    result: VnpayParams,
    now: Date,
    submitted: boolean,
  ) {
    const isConfirmedRefund =
      result.vnp_Command === 'refund' &&
      result.vnp_TransactionType === '02' &&
      result.vnp_ResponseCode === '00' &&
      result.vnp_TransactionStatus === '00';

    const explicitlyRejected =
      (submitted && DEFINITIVE_REJECTIONS.has(result.vnp_ResponseCode ?? '')) ||
      result.vnp_TransactionType === '02' &&
        result.vnp_ResponseCode === '00' &&
        result.vnp_TransactionStatus === '09' &&
        (submitted
          ? result.vnp_Command === 'refund'
          : result.vnp_Command === 'querydr');

    const queryConfirmsRefund =
      !submitted &&
      result.vnp_Command === 'querydr' &&
      result.vnp_TransactionType === '02' &&
      result.vnp_TransactionStatus === '00' &&
      result.vnp_ResponseCode === '00';

    const confirmed = isConfirmedRefund || queryConfirmsRefund;
    const status = confirmed
      ? 'SUCCEEDED'
      : explicitlyRejected
        ? 'FAILED'
        : 'NEEDS_REVIEW';
    const attemptStatus = confirmed
      ? 'CONFIRMED'
      : explicitlyRejected
        ? 'REJECTED'
        : 'AMBIGUOUS';
    const errorMessage = confirmed
      ? null
      : explicitlyRejected
        ? 'VNPay từ chối yêu cầu hoàn tiền.'
        : 'VNPay chưa cung cấp xác nhận hoàn tiền. Hệ thống không gửi lại tự động để tránh hoàn trùng.';

    await this.prisma.$transaction(async (tx) => {
      await tx.refundAttempt.update({
        where: { id: attemptId },
        data: {
          status: attemptStatus,
          responseId: result.vnp_ResponseId ?? null,
          responseCode: result.vnp_ResponseCode ?? null,
          responseMessage: result.vnp_Message ?? null,
          responseTransactionNo: result.vnp_TransactionNo ?? null,
          responsePayDate: result.vnp_PayDate ?? null,
          responseTransactionStatus: result.vnp_TransactionStatus ?? null,
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
