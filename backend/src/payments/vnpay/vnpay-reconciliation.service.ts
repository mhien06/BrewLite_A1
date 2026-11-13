import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { VnpayIpnService } from './vnpay-ipn.service.js';
import {
  VnpayApiError,
  VnpayTransactionApiService,
} from './vnpay-transaction-api.service.js';

export const MAX_RECONCILIATION_ATTEMPTS = 12;
const MISSING_IPN_AGE_MS = 5 * 60_000;

@Injectable()
export class VnpayReconciliationService {
  private readonly logger = new Logger(VnpayReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: VnpayTransactionApiService,
    private readonly settlement: VnpayIpnService,
  ) {}

  async reconcilePendingPayments(
    now = new Date(),
    paymentId?: number,
  ): Promise<void> {
    const eligible = await this.prisma.payment.findMany({
      where: {
        ...(paymentId === undefined ? {} : { id: paymentId }),
        method: 'VNPAY',
        status: 'PENDING',
        providerTxnRef: { not: null },
        reconciliationAttempts: { lt: MAX_RECONCILIATION_ATTEMPTS },
        AND: [
          {
            OR: [
              { expiresAt: { lte: now } },
              {
                createdAt: {
                  lte: new Date(now.getTime() - MISSING_IPN_AGE_MS),
                },
              },
            ],
          },
          {
            OR: [
              { reconciliationNextAt: null },
              { reconciliationNextAt: { lte: now } },
            ],
          },
        ],
      },
      orderBy: [
        { reconciliationNextAt: { sort: 'asc', nulls: 'first' } },
        { id: 'asc' },
      ],
      take: 20,
    });

    for (const payment of eligible) {
      if (!payment.providerTxnRef) continue;
      const token = randomUUID();
      // Persist the budget BEFORE network I/O. CAS prevents two workers claiming
      // the same snapshot. Backoff also serves as a crash-recoverable lease.
      // At least 5 minutes between queries, matching VNPay's duplicate-query
      // window (code 94), and exceeding API + settlement timeouts.
      const delay = Math.min(
        300_000 * 2 ** payment.reconciliationAttempts,
        3_600_000,
      );
      const claimed = await this.prisma.payment.updateMany({
        where: {
          id: payment.id,
          status: 'PENDING',
          reconciliationAttempts: payment.reconciliationAttempts,
          reconciliationNextAt: payment.reconciliationNextAt,
          reconciliationToken: payment.reconciliationToken,
        },
        data: {
          reconciliationAttempts: { increment: 1 },
          reconciliationNextAt: new Date(
            Math.max(Date.now(), now.getTime()) + delay,
          ),
          reconciliationToken: token,
          reconciliationResult: 'STARTED',
        },
      });
      if (!claimed.count) continue;

      let result = 'UNRESOLVED';
      try {
        const response = await this.gateway.queryTransaction({
          txnRef: payment.providerTxnRef,
          transactionDate: payment.createdAt,
          transactionNo: payment.providerTransactionNo,
          expectedAmount: payment.amount,
          ipAddress: process.env.VNPAY_SERVER_IP || '127.0.0.1',
          requestId: token.replaceAll('-', ''),
        });
        const settled = await this.settlement.handleQueryResult(
          response,
          payment.providerTxnRef,
        );
        result =
          settled.RspCode === '00'
            ? 'CONFIRMED'
            : settled.RspCode === '02'
              ? 'ALREADY_PROCESSED'
              : 'UNRESOLVED';
      } catch (error) {
        // Never log raw responses/errors: they may include credentials/payloads.
        result = 'ERROR';
        const reason =
          error instanceof VnpayApiError
            ? error.reason
            : 'CONFIG_OR_PROCESSING_ERROR';
        this.logger.warn(
          `Payment #${payment.id}: QueryDR chưa xác minh được kết quả (${reason}).`,
        );
        if (error instanceof VnpayApiError && error.diagnostic) {
          this.logger.warn(
            `QueryDR diagnostic: signature=${error.diagnostic.signature}, ` +
              `unverifiedResponseCode=${error.diagnostic.unverifiedResponseCode}, ` +
              `unverifiedMessage=${error.diagnostic.unverifiedMessage}`,
          );
        }
      }
      await this.prisma.payment.updateMany({
        where: { id: payment.id, reconciliationToken: token },
        data: { reconciliationToken: null, reconciliationResult: result },
      });
    }
  }
}
