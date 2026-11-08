import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { OrderStatus, PaymentMethod } from '../../generated/prisma/client.js';
import { OrderStateService } from '../../orders/order-state.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VnpayService } from './vnpay.service.js';

describe('VnpayService - create payment URL', () => {
  const createdAt = new Date('2026-11-04T06:30:44.000Z');

  const transaction = {
    order: {
      findFirst: vi.fn(),
    },
    payment: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };

  const prisma = {
    order: { findFirst: vi.fn() },
    payment: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  };

  const orderState = {
    transition: vi.fn(),
  };

  let service: VnpayService;

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.VNPAY_TMN_CODE = 'TESTCODE';
    process.env.VNPAY_HASH_SECRET = 'test-secret';
    process.env.VNPAY_PAYMENT_URL =
      'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
    process.env.VNPAY_RETURN_URL = 'https://example.test/payments/vnpay/return';
    process.env.FRONTEND_URL = 'http://localhost:3000';

    prisma.order.findFirst.mockResolvedValue({ status: OrderStatus.PENDING });
    prisma.payment.findUnique.mockResolvedValue(null);
    transaction.payment.findUnique.mockResolvedValue(null);
    transaction.payment.findFirst.mockResolvedValue(null);
    transaction.order.findFirst.mockResolvedValue({
      id: 10,
      status: OrderStatus.PENDING,
      total: 172_800,
    });

    transaction.payment.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 5,
          ...data,
          paidAt: null,
          createdAt,
          updatedAt: createdAt,
        }),
    );

    service = new VnpayService(
      prisma as unknown as PrismaService,
      orderState as unknown as OrderStateService,
    );
  });

  it('uses the amount stored in the order', async () => {
    const result = await service.createPaymentUrl(
      7,
      { orderId: 10, locale: 'vn' },
      'vnpay-key-1',
      '::ffff:127.0.0.1',
    );

    expect(transaction.order.findFirst).toHaveBeenCalledWith({
      where: { id: 10, userId: 7 },
      select: {
        id: true,
        status: true,
        total: true,
        createdAt: true,
      },
    });

    expect(transaction.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 7,
        orderId: 10,
        idempotencyKey: 'vnpay-key-1',
        method: PaymentMethod.VNPAY,
        simulateSuccess: null,
        amount: 172_800,
        status: OrderStatus.PENDING,
        providerTxnRef: expect.stringMatching(/^BL[0-9A-F]+$/),
        expiresAt: expect.any(Date),
      }),
    });

    const paymentUrl = new URL(result.paymentUrl);

    expect(paymentUrl.searchParams.get('vnp_Amount')).toBe('17280000');
    expect(result.amount).toBe(172_800);
    expect(result.orderId).toBe(10);
    expect(result.status).toBe(OrderStatus.PENDING);
  });

  it('replays the existing pending payment for the same key', async () => {
    prisma.payment.findUnique.mockResolvedValue({
      id: 8,
      userId: 7,
      orderId: 10,
      idempotencyKey: 'replay-key',
      method: PaymentMethod.VNPAY,
      simulateSuccess: null,
      amount: 172_800,
      status: OrderStatus.PENDING,
      paidAt: null,
      providerTxnRef: 'BLREPLAY123',
      providerTransactionNo: null,
      providerResponseCode: null,
      providerTransactionStatus: null,
      providerPayDate: null,
      providerBankCode: null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      createdAt,
      updatedAt: createdAt,
    });

    const result = await service.createPaymentUrl(
      7,
      { orderId: 10, locale: 'vn' },
      'replay-key',
      '127.0.0.1',
    );

    expect(result.paymentId).toBe(8);
    expect(result.txnRef).toBe('BLREPLAY123');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects the same key with another order', async () => {
    prisma.payment.findUnique.mockResolvedValue({
      id: 8,
      orderId: 99,
      method: PaymentMethod.VNPAY,
      amount: 172_800,
      status: OrderStatus.PENDING,
      providerTxnRef: 'BLREPLAY123',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      createdAt,
    });

    await expect(
      service.createPaymentUrl(
        7,
        { orderId: 10, locale: 'vn' },
        'replay-key',
        '127.0.0.1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a missing Idempotency-Key', async () => {
    await expect(
      service.createPaymentUrl(
        7,
        { orderId: 10, locale: 'vn' },
        undefined,
        '127.0.0.1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an order that is already paid', async () => {
    transaction.order.findFirst.mockResolvedValue({
      id: 10,
      status: OrderStatus.PAID,
      total: 172_800,
    });

    await expect(
      service.createPaymentUrl(
        7,
        { orderId: 10, locale: 'vn' },
        'new-key',
        '127.0.0.1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.payment.create).not.toHaveBeenCalled();
  });

  it('creates a fresh sandbox transaction while an earlier one is still pending', async () => {
    transaction.payment.findFirst.mockResolvedValue({
      id: 8,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    const result = await service.createPaymentUrl(
      7,
      { orderId: 10, locale: 'vn' },
      'retry-key-2',
      '127.0.0.1',
    );

    expect(transaction.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idempotencyKey: 'retry-key-2',
        providerTxnRef: expect.stringMatching(/^BL[0-9A-F]+$/),
      }),
    });
    expect(result.txnRef).toMatch(/^BL[0-9A-F]+$/);
  });

  it('returns a failed order to pending before retrying', async () => {
    transaction.order.findFirst.mockResolvedValue({
      id: 10,
      status: OrderStatus.PAYMENT_FAILED,
      total: 172_800,
    });

    await service.createPaymentUrl(
      7,
      { orderId: 10, locale: 'vn' },
      'retry-key',
      '127.0.0.1',
    );

    expect(orderState.transition).toHaveBeenCalledWith(
      10,
      OrderStatus.PENDING,
      transaction,
    );
  });
});
