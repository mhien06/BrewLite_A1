import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { VnpayRefundClient } from './vnpay-refund.client.js';
import {
  VnpayRefundService,
} from './vnpay-refund.service.js';

describe('VnpayRefundService', () => {
  const payment = {
    id: 12,
    method: 'VNPAY',
    status: 'PAID',
    amount: 120000,
    providerTxnRef: 'BL-12',
    providerTransactionNo: '123456',
    createdAt: new Date('2026-11-11T03:00:00.000Z'),
  };
  const refund = {
    id: 30,
    paymentId: payment.id,
    orderId: 12,
    amount: 120000,
    reason: 'Khách yêu cầu hủy',
    status: 'PENDING',
    requestId: null,
    requestedById: 7,
    checkedAt: null,
    payment,
  };
  const tx = {
    refund: { updateMany: vi.fn() },
    refundAttempt: {
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const prisma = {
    refund: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
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
    requestRefund: vi.fn(),
    queryTransaction: vi.fn(),
  };
  let service: VnpayRefundService;

  const response = (
    outcome:
      | 'ACCEPTED'
      | 'COMPLETED'
      | 'REJECTED'
      | 'ORIGINAL_PAYMENT_CONFIRMED'
      | 'UNKNOWN',
    overrides: Record<string, string> = {},
  ) => ({
    outcome,
    responseId: 'response-12',
    responseCode: '00',
    transactionStatus: '00',
    transactionNo: '987654321',
    payDate: '20261111110000',
    message: 'Refund response',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.refund.findMany.mockResolvedValue([refund]);
    prisma.refund.updateMany.mockResolvedValue({ count: 1 });
    prisma.refundAttempt.count.mockResolvedValue(0);
    prisma.refundAttempt.create.mockResolvedValue({ id: 501 });
    tx.refund.updateMany.mockResolvedValue({ count: 1 });
    tx.refundAttempt.count.mockResolvedValue(0);
    tx.refundAttempt.update.mockResolvedValue({ id: 501 });
    tx.refundAttempt.updateMany.mockResolvedValue({ count: 1 });
    gateway.requestRefund.mockResolvedValue(response('COMPLETED'));
    service = new VnpayRefundService(
      prisma as unknown as PrismaService,
      gateway as unknown as VnpayRefundClient,
    );
  });

  it('marks a refund successful only after a completed signed refund response', async () => {
    const now = new Date('2026-11-11T04:00:00.000Z');
    await service.processRefunds(now);

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
        initiatedById: null,
        requestId: expect.stringMatching(/^[0-9a-f]{32}$/),
      }),
      select: { id: true },
    });
    expect(gateway.requestRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        txnRef: 'BL-12',
        amount: 120000,
        transactionDate: '20261111100000',
        transactionNo: '123456',
        requestId: expect.stringMatching(/^[0-9a-f]{32}$/),
      }),
    );
    expect(tx.refundAttempt.update).toHaveBeenCalledWith({
      where: { id: 501 },
      data: expect.objectContaining({
        status: 'CONFIRMED',
        responseId: 'response-12',
        responseMessage: 'Refund response',
        responseTransactionNo: '987654321',
        responsePayDate: '20261111110000',
        responseCode: '00',
      }),
    });
    expect(tx.refund.updateMany).toHaveBeenCalledWith({
      where: { id: 30, status: 'PROCESSING', checkedAt: now },
      data: expect.objectContaining({
        status: 'SUCCEEDED',
        completedAt: now,
      }),
    });
  });

  it('does not report an accepted refund as completed', async () => {
    gateway.requestRefund.mockResolvedValue(
      response('ACCEPTED', { transactionStatus: '05' }),
    );
    await service.processRefunds(new Date('2026-11-11T04:00:00.000Z'));

    expect(tx.refund.updateMany).toHaveBeenCalledWith({
      where: { id: 30, status: 'PROCESSING', checkedAt: expect.any(Date) },
      data: expect.objectContaining({
        status: 'PROCESSING',
        completedAt: null,
      }),
    });
  });

  it('keeps a rejected submission in review when QueryDR only confirms the original payment', async () => {
    const firstCheck = new Date('2026-11-11T04:00:00.000Z');
    const secondCheck = new Date('2026-11-11T04:02:00.000Z');
    gateway.requestRefund.mockResolvedValue(
      response('REJECTED', {
        responseCode: '95',
        transactionStatus: '09',
        message: 'Refund rejected',
      }),
    );
    prisma.refund.findMany
      .mockResolvedValueOnce([refund])
      .mockResolvedValueOnce([
        { ...refund, status: 'NEEDS_REVIEW', checkedAt: firstCheck },
      ]);
    prisma.refundAttempt.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);
    tx.refundAttempt.count.mockResolvedValueOnce(1);
    gateway.queryTransaction.mockResolvedValue(
      response('ORIGINAL_PAYMENT_CONFIRMED', { transactionType: '01' }),
    );

    await service.processRefunds(firstCheck);

    expect(tx.refund.updateMany).toHaveBeenCalledWith({
      where: { id: 30, status: 'PROCESSING', checkedAt: expect.any(Date) },
      data: expect.objectContaining({
        status: 'NEEDS_REVIEW',
        completedAt: null,
        lastError: 'Refund rejected',
      }),
    });
    expect(tx.refundAttempt.update).toHaveBeenCalledWith({
      where: { id: 501 },
      data: expect.objectContaining({ status: 'REJECTED' }),
    });

    await service.processRefunds(secondCheck);
    expect(gateway.queryTransaction).toHaveBeenCalledTimes(1);
    expect(gateway.requestRefund).toHaveBeenCalledTimes(1);
    expect(tx.refund.updateMany).toHaveBeenLastCalledWith({
      where: { id: 30, status: 'PROCESSING', checkedAt: secondCheck },
      data: expect.objectContaining({
        status: 'NEEDS_REVIEW',
        completedAt: null,
        lastError: expect.stringContaining('không chứng minh chưa có Refund'),
      }),
    });
  });

  it('keeps an uncertain refund in review when QueryDR only confirms the original payment', async () => {
    const firstCheck = new Date('2026-11-11T04:00:00.000Z');
    const secondCheck = new Date('2026-11-11T04:02:00.000Z');
    const thirdCheck = new Date('2026-11-11T04:04:00.000Z');
    gateway.requestRefund.mockRejectedValueOnce(new Error('timeout'));
    gateway.queryTransaction.mockResolvedValue(
      response('ORIGINAL_PAYMENT_CONFIRMED', {
        transactionType: '01',
        message: 'Original payment is successful.',
      }),
    );
    prisma.refund.findMany
      .mockResolvedValueOnce([refund])
      .mockResolvedValueOnce([
        {
          ...refund,
          status: 'NEEDS_REVIEW',
          requestId: 'existing-refund-request',
          checkedAt: firstCheck,
        },
      ])
      .mockResolvedValueOnce([
        {
          ...refund,
          status: 'NEEDS_REVIEW',
          requestId: 'existing-refund-request',
          checkedAt: secondCheck,
        },
      ]);
    await service.processRefunds(firstCheck);
    expect(tx.refund.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: 30,
        status: { in: ['PENDING', 'PROCESSING', 'NEEDS_REVIEW'] },
      },
      data: expect.objectContaining({
        status: 'NEEDS_REVIEW',
        lastError: 'timeout',
      }),
    });
    expect(gateway.requestRefund).toHaveBeenCalledTimes(1);
    expect(gateway.queryTransaction).not.toHaveBeenCalled();

    await service.processRefunds(secondCheck);
    expect(gateway.queryTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        txnRef: 'BL-12',
        expectedAmount: 120000,
      }),
    );
    expect(gateway.requestRefund).toHaveBeenCalledTimes(1);
    expect(tx.refund.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'NEEDS_REVIEW',
          completedAt: null,
          lastError: expect.stringContaining('không chứng minh chưa có Refund'),
        }),
      }),
    );

    await service.processRefunds(thirdCheck);
    expect(gateway.queryTransaction).toHaveBeenCalledTimes(2);
    expect(gateway.requestRefund).toHaveBeenCalledTimes(1);
    expect(tx.refundAttempt.count).not.toHaveBeenCalled();
  });

  it('marks a refund failed when QueryDR confirms the provider rejected it', async () => {
    prisma.refund.findMany.mockResolvedValue([
      { ...refund, status: 'NEEDS_REVIEW', checkedAt: new Date(0) },
    ]);
    gateway.queryTransaction.mockResolvedValue(
      response('REJECTED', {
        responseCode: '00',
        transactionType: '02',
        transactionStatus: '09',
      }),
    );

    await service.processRefunds(new Date('2026-11-11T04:00:00.000Z'));

    expect(gateway.requestRefund).not.toHaveBeenCalled();
    expect(tx.refund.updateMany).toHaveBeenLastCalledWith({
      where: { id: 30, status: 'PROCESSING', checkedAt: expect.any(Date) },
      data: expect.objectContaining({ status: 'FAILED' }),
    });
  });

  it('never resubmits based solely on a successful query of the original payment', async () => {
    prisma.refund.findMany.mockResolvedValue([
      { ...refund, status: 'NEEDS_REVIEW', checkedAt: new Date(0) },
    ]);
    gateway.queryTransaction.mockResolvedValue(
      response('ORIGINAL_PAYMENT_CONFIRMED', { transactionType: '01' }),
    );

    await service.processRefunds(new Date('2026-11-11T04:00:00.000Z'));

    expect(gateway.requestRefund).not.toHaveBeenCalled();
    expect(tx.refundAttempt.count).not.toHaveBeenCalled();
    expect(tx.refund.updateMany).toHaveBeenLastCalledWith({
      where: { id: 30, status: 'PROCESSING', checkedAt: expect.any(Date) },
      data: expect.objectContaining({
        status: 'NEEDS_REVIEW',
        lastError: expect.stringContaining('không chứng minh chưa có Refund'),
      }),
    });
  });

  it('does not send partial refunds or refund non-VNPay payments', async () => {
    prisma.refund.findMany.mockResolvedValue([
      { ...refund, amount: 60000 },
      {
        ...refund,
        id: 31,
        payment: { ...payment, method: 'WALLET' },
      },
    ]);

    await service.processRefunds(new Date('2026-11-11T04:00:00.000Z'));

    expect(gateway.requestRefund).not.toHaveBeenCalled();
    expect(tx.refund.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.refund.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ status: 'NEEDS_REVIEW' }),
      }),
    );
    expect(tx.refund.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ id: 31 }),
        data: expect.objectContaining({ status: 'NEEDS_REVIEW' }),
      }),
    );
  });

  it('keeps an unknown query result in review and never resends', async () => {
    prisma.refund.findMany.mockResolvedValue([
      { ...refund, status: 'NEEDS_REVIEW', checkedAt: new Date(0) },
    ]);
    gateway.queryTransaction.mockResolvedValue(
      response('UNKNOWN', {
        responseCode: '99',
        transactionType: '',
        transactionStatus: '',
      }),
    );

    await service.processRefunds(new Date('2026-11-11T04:00:00.000Z'));

    expect(gateway.requestRefund).not.toHaveBeenCalled();
    expect(tx.refund.updateMany).toHaveBeenLastCalledWith({
      where: { id: 30, status: 'PROCESSING', checkedAt: expect.any(Date) },
      data: expect.objectContaining({ status: 'NEEDS_REVIEW' }),
    });
  });

  it('does not call VNPay when another worker already claimed the refund', async () => {
    prisma.refund.updateMany.mockResolvedValue({ count: 0 });

    await service.processRefunds(new Date('2026-11-11T04:00:00.000Z'));

    expect(prisma.refundAttempt.create).not.toHaveBeenCalled();
    expect(gateway.requestRefund).not.toHaveBeenCalled();
    expect(gateway.queryTransaction).not.toHaveBeenCalled();
  });
});
