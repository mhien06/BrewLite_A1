import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { VnpayIpnService } from './vnpay-ipn.service.js';
import { VnpayTransactionApiService } from './vnpay-transaction-api.service.js';
import { VnpayReconciliationService } from './vnpay-reconciliation.service.js';
import { signedQueryResult } from '../../../test/vnpay-query-fixture.js';

describe('Pending VNPay reconciliation', () => {
  const payment = {
    id: 3,
    providerTxnRef: 'BLTEST123',
    amount: 30000,
    createdAt: new Date('2026-11-13T03:00:00Z'),
    providerTransactionNo: null,
    reconciliationAttempts: 0,
    reconciliationNextAt: null,
    reconciliationToken: null,
  };
  const prisma = { payment: { findMany: vi.fn(), updateMany: vi.fn() } };
  const gateway = { queryTransaction: vi.fn() };
  const settlement = { handleQueryResult: vi.fn() };
  const service = new VnpayReconciliationService(
    prisma as unknown as PrismaService,
    gateway as unknown as VnpayTransactionApiService,
    settlement as unknown as VnpayIpnService,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.payment.findMany.mockResolvedValue([payment]);
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });
    gateway.queryTransaction.mockResolvedValue(signedQueryResult());
    settlement.handleQueryResult.mockResolvedValue({ RspCode: '00' });
  });

  it('queries the stored amount/date and uses the shared settlement after a durable claim', async () => {
    await service.reconcilePendingPayments();
    expect(gateway.queryTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        txnRef: payment.providerTxnRef,
        expectedAmount: 30000,
        transactionDate: payment.createdAt,
      }),
    );
    expect(prisma.payment.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      gateway.queryTransaction.mock.invocationCallOrder[0],
    );
    expect(settlement.handleQueryResult).toHaveBeenCalledWith(
      signedQueryResult(),
      payment.providerTxnRef,
    );
    expect(prisma.payment.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { reconciliationToken: null, reconciliationResult: 'CONFIRMED' },
      }),
    );
  });

  it('skips a payment already claimed by another worker', async () => {
    prisma.payment.updateMany.mockResolvedValue({ count: 0 });
    await service.reconcilePendingPayments();
    expect(gateway.queryTransaction).not.toHaveBeenCalled();
  });

  it.each(['timeout', 'network error', 'invalid signature'])(
    'does not settle after %s',
    async (message) => {
      gateway.queryTransaction.mockRejectedValue(new Error(message));
      await service.reconcilePendingPayments();
      expect(settlement.handleQueryResult).not.toHaveBeenCalled();
      expect(prisma.payment.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: { reconciliationToken: null, reconciliationResult: 'ERROR' },
        }),
      );
    },
  );

  it('retains unresolved results for a bounded retry without changing business state', async () => {
    settlement.handleQueryResult.mockResolvedValue({ RspCode: '99' });
    await service.reconcilePendingPayments();
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PENDING',
          reconciliationAttempts: { lt: 12 },
        }),
        take: 20,
      }),
    );
    expect(prisma.payment.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { reconciliationToken: null, reconciliationResult: 'UNRESOLVED' },
      }),
    );
  });
});
