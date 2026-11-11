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
    const eligible = await this.prisma.payment.findMany({
      where: {
        method: 'VNPAY',
        status: 'PAID',
        refundStatus: { in: ['PENDING', 'PROCESSING', 'NEEDS_REVIEW'] },
        OR: [
          { refundCheckedAt: null },
          { refundCheckedAt: { lte: new Date(now.getTime() - CHECK_INTERVAL_MS) } },
        ],
      },
      orderBy: [{ refundCheckedAt: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
      take: 20,
    });

    for (const payment of eligible) {
      if (!payment.providerTxnRef || !payment.refundAmount || !payment.refundRequestId && payment.refundStatus !== 'PENDING') {
        await this.markNeedsReview(payment.id, now, 'Thiếu mã giao dịch hoặc dữ liệu yêu cầu hoàn tiền.');
        continue;
      }

      const previousStatus = payment.refundStatus;
      const requestId = payment.refundRequestId ?? randomBytes(16).toString('hex');
      const claimed = await this.prisma.payment.updateMany({
        where: {
          id: payment.id,
          refundStatus: previousStatus,
          refundCheckedAt: payment.refundCheckedAt,
        },
        data: {
          refundStatus: 'PROCESSING',
          refundRequestId: requestId,
          refundCheckedAt: now,
          ...(previousStatus === 'PENDING' ? { refundSubmittedAt: now } : {}),
        },
      });
      if (!claimed.count) continue;

      try {
        const common = {
          txnRef: payment.providerTxnRef,
          transactionNo: payment.providerTransactionNo,
          transactionDate: this.toTransactionDate(payment.providerPayDate, payment.createdAt),
          ipAddress: process.env.VNPAY_SERVER_IP || '127.0.0.1',
        };
        const result = previousStatus === 'PENDING'
          ? await this.gateway.refundTransaction({
              ...common,
              amount: payment.refundAmount,
              createdBy: 'BrewLite',
              requestId,
              transactionType: '02',
            }, now)
          : await this.gateway.queryTransaction({
              ...common,
              expectedAmount: payment.amount,
            }, now);
        await this.recordResult(payment.id, result, now, previousStatus === 'PENDING');
      } catch (error) {
        // A network timeout is ambiguous: VNPay may already have accepted the refund.
        // Never send a second refund request automatically.
        await this.markNeedsReview(
          payment.id,
          now,
          error instanceof Error ? error.message : 'Không xác định được kết quả từ VNPay.',
        );
      }
    }
  }

  async retryRejectedRefund(id: number) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, method: 'VNPAY', status: 'PAID', refundStatus: 'FAILED' },
      select: { id: true, refundAmount: true, refundRequestId: true },
    });
    if (!payment) {
      throw new ConflictException('Chỉ có thể gửi lại yêu cầu đã bị VNPay từ chối rõ ràng.');
    }
    const result = await this.prisma.payment.updateMany({
      where: { id, refundStatus: 'FAILED' },
      data: {
        refundStatus: 'PENDING',
        refundRequestId: randomBytes(16).toString('hex'),
        refundCheckedAt: null,
        refundSubmittedAt: null,
        refundCompletedAt: null,
        refundResponseCode: null,
        refundTransactionStatus: null,
        refundLastError: null,
      },
    });
    if (!result.count) throw new ConflictException('Yêu cầu hoàn tiền vừa được thay đổi.');
    return { message: 'Đã đưa yêu cầu hoàn tiền bị từ chối vào hàng đợi gửi lại.' };
  }

  private toTransactionDate(raw: string | null, fallback: Date): Date {
    if (!raw || !/^\\d{14}$/.test(raw)) return fallback;
    const year = Number(raw.slice(0, 4));
    const month = Number(raw.slice(4, 6));
    const day = Number(raw.slice(6, 8));
    const hour = Number(raw.slice(8, 10));
    const minute = Number(raw.slice(10, 12));
    const second = Number(raw.slice(12, 14));
    // Convert VN local wall time to an instant; formatVnpayDate adds UTC+7 back.
    return new Date(Date.UTC(year, month - 1, day, hour - 7, minute, second));
  }

  private async recordResult(id: number, result: VnpayParams, now: Date, submitted: boolean) {
    const isConfirmedRefund =
      result.vnp_Command === 'refund' &&
      result.vnp_TransactionType === '02' &&
      result.vnp_ResponseCode === '00' &&
      result.vnp_TransactionStatus === '00';

    const explicitlyRejected = submitted &&
      DEFINITIVE_REJECTIONS.has(result.vnp_ResponseCode ?? '');

    const queryConfirmsRefund =
      !submitted &&
      result.vnp_TransactionType === '02' &&
      result.vnp_TransactionStatus === '00' &&
      result.vnp_ResponseCode === '00';

    await this.prisma.payment.updateMany({
      where: { id, refundStatus: 'PROCESSING', refundCheckedAt: now },
      data: {
        refundStatus: isConfirmedRefund || queryConfirmsRefund
          ? 'SUCCEEDED'
          : explicitlyRejected
            ? 'FAILED'
            : 'NEEDS_REVIEW',
        refundCompletedAt: isConfirmedRefund || queryConfirmsRefund ? now : null,
        refundResponseCode: result.vnp_ResponseCode ?? null,
        refundTransactionStatus: result.vnp_TransactionStatus ?? null,
        refundLastError: isConfirmedRefund || queryConfirmsRefund
          ? null
          : explicitlyRejected
            ? 'VNPay từ chối yêu cầu hoàn tiền.'
            : 'VNPay chưa cung cấp xác nhận hoàn tiền. Hệ thống không gửi lại tự động để tránh hoàn trùng.',
      },
    });
  }

  private async markNeedsReview(id: number, now: Date, message: string) {
    await this.prisma.payment.updateMany({
      where: { id, refundStatus: { in: ['PENDING', 'PROCESSING', 'NEEDS_REVIEW'] } },
      data: {
        refundStatus: 'NEEDS_REVIEW',
        refundCheckedAt: now,
        refundLastError: message.slice(0, 1000),
      },
    });
    this.logger.warn(`Refund payment #${id} needs reconciliation: ${message}`);
  }
}