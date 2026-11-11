import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VnpayRefundService } from './vnpay-refund.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { VnpayTransactionApiService } from './vnpay-transaction-api.service.js';

describe('VnpayRefundService', () => {
  const payment = {
    id: 12,
    method: 'VNPAY',
    status: 'PAID',
    refundStatus: 'PENDING',
    refundCheckedAt: null,
    refundRequestId: null,
    refundAmount: 120000,
    amount: 120000,
    providerTxnRef: 'BL-12',
    providerTransactionNo: '123456',
    providerPayDate: '20261111150000',
    createdAt: new Date('2026-11-11T03:00:00.000Z'),
  };
  const prisma = {
    payment: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
    },
  };
  const gateway = {
    refundTransaction: vi.fn(),
    queryTransaction: vi.fn(),
  };
  let service: VnpayRefundService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.payment.findMany.mockResolvedValue([payment]);
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });
    service = new VnpayRefundService(
      prisma as unknown as PrismaService,
      gateway as unknown as VnpayTransactionApiService,
    );
  });

  it('marks a refund successful only after a signed refund success response', async () => {
    gateway.refundTransaction.mockResolvedValue({
      vnp_Command: 'refund',
      vnp_TransactionType: '02',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
    });

    await service.processRefunds(new Date('2026-11-11T04:00:00.000Z'));

    expect(gateway.refundTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        txnRef: 'BL-12',
        amount: 120000,
        transactionDate: payment.createdAt,
        requestId: expect.stringMatching(/^[0-9a-f]{32}$/),
      }),
      expect.any(Date),
    );
    expect(prisma.payment.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ refundStatus: 'PROCESSING' }),
        data: expect.objectContaining({
          refundStatus: 'SUCCEEDED',
          refundCompletedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('moves ambiguous VNPay response to review and never resends automatically', async () => {
    gateway.refundTransaction.mockResolvedValue({
      vnp_Command: 'refund',
      vnp_TransactionType: '02',
      vnp_ResponseCode: '99',
      vnp_TransactionStatus: 'processing',
    });
    await service.processRefunds(new Date('2026-11-11T04:00:00.000Z'));

    expect(prisma.payment.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ refundStatus: 'NEEDS_REVIEW' }),
      }),
    );

    prisma.payment.findMany.mockResolvedValue([{
      ...payment,
      refundStatus: 'NEEDS_REVIEW',
      refundRequestId: 'existing-request-id',
      refundCheckedAt: new Date('2026-11-11T04:00:00.000Z'),
    }]);
    gateway.queryTransaction.mockResolvedValue({
      vnp_Command: 'querydr',
      vnp_TransactionType: '01',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
    });
    await service.processRefunds(new Date('2026-11-11T04:02:00.000Z'));

    expect(gateway.refundTransaction).toHaveBeenCalledTimes(1);
    expect(gateway.queryTransaction).toHaveBeenCalledTimes(1);
    expect(prisma.payment.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ refundStatus: 'NEEDS_REVIEW' }),
      }),
    );
  });

  it('marks explicit VNPay rejection as failed and allows staff-only retry path', async () => {
    gateway.refundTransaction.mockResolvedValue({
      vnp_Command: 'refund',
      vnp_TransactionType: '02',
      vnp_ResponseCode: '91',
      vnp_TransactionStatus: '09',
    });
    await service.processRefunds(new Date('2026-11-11T04:00:00.000Z'));

    expect(prisma.payment.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ refundStatus: 'FAILED' }),
      }),
    );

    prisma.payment.findFirst.mockResolvedValue({
      id: 12,
      refundAmount: 120000,
      refundRequestId: 'old-request',
    });
    await service.retryRejectedRefund(12);
    expect(prisma.payment.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 12, refundStatus: 'FAILED' },
        data: expect.objectContaining({
          refundStatus: 'PENDING',
          refundRequestId: expect.stringMatching(/^[0-9a-f]{32}$/),
        }),
      }),
    );
  });

  it('does not call VNPay when another worker already claimed the refund', async () => {
    prisma.payment.updateMany.mockResolvedValue({ count: 0 });
    await service.processRefunds(new Date('2026-11-11T04:00:00.000Z'));
    expect(gateway.refundTransaction).not.toHaveBeenCalled();
    expect(gateway.queryTransaction).not.toHaveBeenCalled();
  });
});