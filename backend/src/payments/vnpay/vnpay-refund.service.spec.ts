import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VnpayRefundService } from './vnpay-refund.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { VnpayTransactionApiService } from './vnpay-transaction-api.service.js';

describe('VnpayRefundService', () => {
  const payment = {
    id: 12,
    method: 'VNPAY',
    status: 'PAID',
    amount: 120000,
    providerTxnRef: 'BL-12',
    providerTransactionNo: '123456',
    providerPayDate: '20261111150000',
    createdAt: new Date('2026-11-11T03:00:00.000Z'),
  };
  const refund = {
    id: 30,
    paymentId: payment.id,
    amount: 120000,
    reason: 'Khách yêu cầu hủy',
    status: 'PENDING',
    requestId: null,
    requestedById: 7,
    retryRequestedById: null,
    checkedAt: null,
    payment,
  };
  const tx = {
    refund: { updateMany: vi.fn() },
    refundAttempt: { update: vi.fn(), updateMany: vi.fn() },
  };
  const prisma = {
    refund: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
    },
    refundAttempt: {
      count: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const gateway = {
    refundTransaction: vi.fn(),
    queryTransaction: vi.fn(),
  };
  let service: VnpayRefundService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.refund.findMany.mockResolvedValue([refund]);
    prisma.refund.updateMany.mockResolvedValue({ count: 1 });
    prisma.refundAttempt.count.mockResolvedValue(0);
    prisma.refundAttempt.create.mockResolvedValue({ id: 501 });
    tx.refund.updateMany.mockResolvedValue({ count: 1 });
    tx.refundAttempt.update.mockResolvedValue({ id: 501 });
    tx.refundAttempt.updateMany.mockResolvedValue({ count: 1 });
    service = new VnpayRefundService(
      prisma as unknown as PrismaService,
      gateway as unknown as VnpayTransactionApiService,
    );
  });

  it('marks a refund successful only after a signed Refund success response', async () => {
    gateway.refundTransaction.mockResolvedValue({
      vnp_Command: 'refund',
      vnp_ResponseId: 'refund-response-12',
      vnp_Message: 'Refund successful',
      vnp_TransactionNo: '987654321',
      vnp_PayDate: '20261111110000',
      vnp_TransactionType: '02',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
    });

    await service.processRefunds(new Date('2026-11-11T04:00:00.000Z'));

    expect(prisma.refundAttempt.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        refundId: 30,
        attemptNumber: 1,
        type: 'REFUND',
        status: 'STARTED',
        transactionRef: 'BL-12',
        transactionDate: payment.createdAt,
        amount: 120000,
        transactionType: '02',
        initiatedById: 7,
        requestId: expect.stringMatching(/^[0-9a-f]{32}$/),
      }),
      select: { id: true },
    });
    expect(gateway.refundTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        txnRef: 'BL-12',
        amount: 120000,
        transactionDate: payment.createdAt,
        requestId: expect.stringMatching(/^[0-9a-f]{32}$/),
      }),
      expect.any(Date),
    );
    expect(tx.refundAttempt.update).toHaveBeenCalledWith({
      where: { id: 501 },
      data: expect.objectContaining({
        status: 'CONFIRMED',
        responseId: 'refund-response-12',
        responseMessage: 'Refund successful',
        responseTransactionNo: '987654321',
        responsePayDate: '20261111110000',
        responseCode: '00',
      }),
    });
    expect(tx.refund.updateMany).toHaveBeenCalledWith({
      where: { id: 30, status: 'PROCESSING', checkedAt: expect.any(Date) },
      data: expect.objectContaining({
        status: 'SUCCEEDED',
        completedAt: expect.any(Date),
      }),
    });
  });

  it('moves ambiguous results to review, records the query attempt, and never resends Refund automatically', async () => {
    gateway.refundTransaction.mockResolvedValue({
      vnp_Command: 'refund',
      vnp_TransactionType: '02',
      vnp_ResponseCode: '99',
      vnp_TransactionStatus: 'processing',
    });
    await service.processRefunds(new Date('2026-11-11T04:00:00.000Z'));

    expect(tx.refund.updateMany).toHaveBeenLastCalledWith({
      where: { id: 30, status: 'PROCESSING', checkedAt: expect.any(Date) },
      data: expect.objectContaining({ status: 'NEEDS_REVIEW' }),
    });
    expect(tx.refundAttempt.update).toHaveBeenLastCalledWith({
      where: { id: 501 },
      data: expect.objectContaining({ status: 'AMBIGUOUS', responseCode: '99' }),
    });

    prisma.refund.findMany.mockResolvedValue([{
      ...refund,
      status: 'NEEDS_REVIEW',
      requestId: 'existing-refund-request',
      checkedAt: new Date('2026-11-11T04:00:00.000Z'),
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
    expect(prisma.refundAttempt.create).toHaveBeenCalledTimes(2);
    expect(prisma.refundAttempt.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ type: 'QUERY' }),
      select: { id: true },
    });
    expect(tx.refund.updateMany).toHaveBeenLastCalledWith({
      where: { id: 30, status: 'PROCESSING', checkedAt: expect.any(Date) },
      data: expect.objectContaining({ status: 'NEEDS_REVIEW', completedAt: null }),
    });
  });

  it('treats VNPay duplicate-processing response 94 as reconciliation, not rejection', async () => {
    gateway.refundTransaction.mockResolvedValue({
      vnp_Command: 'refund',
      vnp_TransactionType: '02',
      vnp_ResponseCode: '94',
      vnp_TransactionStatus: '05',
    });
    await service.processRefunds(new Date('2026-11-11T04:00:00.000Z'));

    expect(tx.refund.updateMany).toHaveBeenLastCalledWith({
      where: { id: 30, status: 'PROCESSING', checkedAt: expect.any(Date) },
      data: expect.objectContaining({ status: 'NEEDS_REVIEW' }),
    });
    expect(tx.refundAttempt.update).toHaveBeenLastCalledWith({
      where: { id: 501 },
      data: expect.objectContaining({ status: 'AMBIGUOUS', responseCode: '94' }),
    });
  });

  it('marks explicit VNPay rejection as failed and allows staff-only retry without deleting history', async () => {
    gateway.refundTransaction.mockResolvedValue({
      vnp_Command: 'refund',
      vnp_TransactionType: '02',
      vnp_ResponseCode: '91',
      vnp_TransactionStatus: '09',
    });
    await service.processRefunds(new Date('2026-11-11T04:00:00.000Z'));

    expect(tx.refund.updateMany).toHaveBeenLastCalledWith({
      where: { id: 30, status: 'PROCESSING', checkedAt: expect.any(Date) },
      data: expect.objectContaining({ status: 'FAILED' }),
    });
    expect(tx.refundAttempt.update).toHaveBeenLastCalledWith({
      where: { id: 501 },
      data: expect.objectContaining({ status: 'REJECTED' }),
    });

    prisma.refund.findFirst.mockResolvedValue({ id: 30 });
    await service.retryRejectedRefund(30, 99);
    expect(prisma.refund.updateMany).toHaveBeenLastCalledWith({
      where: { id: 30, status: 'FAILED' },
      data: {
        status: 'PENDING',
        requestId: null,
        retryRequestedById: 99,
        checkedAt: null,
        submittedAt: null,
        completedAt: null,
        lastError: null,
      },
    });
  });

  it('does not allow a retry unless the Refund is explicitly FAILED', async () => {
    prisma.refund.findFirst.mockResolvedValue(null);
    await expect(service.retryRejectedRefund(30)).rejects.toThrow(
      'Chỉ có thể gửi lại yêu cầu đã bị VNPay từ chối rõ ràng.',
    );
    expect(prisma.refund.updateMany).not.toHaveBeenCalled();
  });

  it('does not call VNPay when another worker already claimed the refund', async () => {
    prisma.refund.updateMany.mockResolvedValue({ count: 0 });
    await service.processRefunds(new Date('2026-11-11T04:00:00.000Z'));
    expect(prisma.refundAttempt.create).not.toHaveBeenCalled();
    expect(gateway.refundTransaction).not.toHaveBeenCalled();
    expect(gateway.queryTransaction).not.toHaveBeenCalled();
  });
});
