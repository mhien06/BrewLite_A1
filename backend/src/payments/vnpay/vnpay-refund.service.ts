import { getVnpayConfig } from './vnpay-config.js';
import { ConflictException, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { VnpayTransactionApiService } from './vnpay-transaction-api.service.js';
import type { VnpayParams } from './vnpay-signature.js';

@Injectable()
export class VnpayRefundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: VnpayTransactionApiService,
  ) {}

  async processRefunds(now = new Date()): Promise<void> {
    const payments = await this.prisma.payment.findMany({
      where: {
        method: 'VNPAY',
        status: 'PAID',
        refundStatus: { in: ['QUEUED', 'PENDING'] },
        OR: [
          { refundCheckedAt: null },
          { refundCheckedAt: { lte: new Date(now.getTime() - 60_000) } },
        ],
      },
      orderBy: [
        { refundCheckedAt: { sort: 'asc', nulls: 'first' } },
        { id: 'asc' },
      ],
      take: 20,
    });
    if (!payments.length) return;
    // Sai cấu hình chưa phải là đã gửi hoàn tiền; giữ hàng đợi để sửa cấu hình rồi thử lại.
    getVnpayConfig();
    for (const payment of payments) {
      if (!payment.providerTxnRef) continue;
      // Ghi nhận trước khi gọi mạng. Hai server không được cùng gửi một yêu cầu hoàn.
      const claimed = await this.prisma.payment.updateMany({
        where: {
          id: payment.id,
          refundStatus: payment.refundStatus,
          refundCheckedAt: payment.refundCheckedAt,
        },
        data: {
          refundStatus: 'PENDING',
          refundCheckedAt: now,
          ...(payment.refundStatus === 'QUEUED'
            ? {
                refundRequestId: randomBytes(16).toString('hex'),
                refundSubmittedAt: now,
              }
            : {}),
        },
      });
      if (!claimed.count) continue;
      const current = await this.prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
      try {
        const input = {
          txnRef: payment.providerTxnRef,
          transactionNo: payment.providerTransactionNo,
          transactionDate: payment.createdAt,
          ipAddress: '127.0.0.1',
        };
        const result =
          payment.refundStatus === 'QUEUED'
            ? await this.gateway.refundTransaction(
                {
                  ...input,
                  amount: payment.amount,
                  createdBy: 'BrewLite',
                  requestId: current.refundRequestId!,
                },
                now,
              )
            : await this.gateway.queryTransaction(
                { ...input, expectedAmount: payment.amount },
                now,
              );
        await this.recordResult(
          payment.id,
          result,
          now,
          payment.refundStatus === 'QUEUED',
        );
      } catch {
        // Timeout có thể xảy ra SAU khi VNPAY nhận tiền hoàn. Chỉ truy vấn lại, không gửi hoàn lần hai.
        await this.prisma.payment.updateMany({
          where: {
            id: payment.id,
            refundStatus: 'PENDING',
            refundCheckedAt: now,
          },
          data: {
            refundLastError:
              'Chưa xác minh được kết quả với VNPAY. Hệ thống sẽ tiếp tục đối soát.',
          },
        });
      }
    }
  }

  async retryRejectedRefund(id: number) {
    const result = await this.prisma.payment.updateMany({
      where: {
        id,
        method: 'VNPAY',
        status: 'PAID',
        refundStatus: 'FAILED',
      },
      data: {
        refundStatus: 'QUEUED',
        refundCheckedAt: null,
        refundRequestId: null,
        refundLastError: null,
        refundSubmittedAt: null,
      },
    });
    if (!result.count)
      throw new ConflictException(
        'Chỉ gửi lại khoản hoàn đã bị VNPAY từ chối. Khoản đang chờ cần tiếp tục đối soát.',
      );
    return { message: 'Đã đưa yêu cầu hoàn tiền vào hàng đợi.' };
  }

  private async recordResult(
    id: number,
    result: VnpayParams,
    now: Date,
    submitted: boolean,
  ) {
    const isRefund = result.vnp_TransactionType === '02';
    const confirmed =
      result.vnp_ResponseCode === '00' &&
      isRefund &&
      result.vnp_TransactionStatus === '00';
    // QueryDR của giao dịch thanh toán gốc (type 01) không chứng minh tiền đã được hoàn.
    const rejected =
      isRefund &&
      result.vnp_ResponseCode === '00' &&
      result.vnp_TransactionStatus === '09';
    const requestRejected =
      submitted &&
      ['02', '03', '91', '95', '97'].includes(result.vnp_ResponseCode);
    await this.prisma.payment.updateMany({
      where: { id, refundStatus: 'PENDING', refundCheckedAt: now },
      data: {
        refundStatus: confirmed
          ? 'SUCCEEDED'
          : rejected || requestRejected
            ? 'FAILED'
            : 'PENDING',
        refundCompletedAt: confirmed ? now : null,
        refundResponseCode: result.vnp_ResponseCode ?? null,
        refundTransactionStatus: result.vnp_TransactionStatus ?? null,
        refundLastError:
          rejected || requestRejected
            ? 'VNPAY chưa chấp nhận hoàn tiền. Cần đối soát cấu hình/giao dịch.'
            : null,
      },
    });
  }
}
