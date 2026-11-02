import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, PaymentMethod } from '../generated/prisma/client.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { LoyaltyService } from '../loyalty/loyalty.service.js';
import { OrderStateService } from '../orders/order-state.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentsService } from './payments.service.js';

describe('PaymentsService', () => {
  const tx = {
    order: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    payment: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };
  const prisma = {
    order: {
      findFirst: vi.fn(),
    },
    payment: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(tx)),
  };
  const loyalty = {
    awardPointsForPaidOrder: vi.fn(),
  };
  const inventory = {
    deductForPaidOrder: vi.fn(),
  };

  let service: PaymentsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PaymentsService(
      prisma as unknown as PrismaService,
      new OrderStateService(prisma as unknown as PrismaService),
      loyalty as unknown as LoyaltyService,
      inventory as unknown as InventoryService,
    );
    prisma.payment.findUnique.mockResolvedValue(null);
    tx.payment.findUnique.mockResolvedValue(null);
    tx.payment.create.mockResolvedValue({ id: 1 });
    inventory.deductForPaidOrder.mockResolvedValue([]);
    tx.order.findUnique
      .mockReset()
      .mockResolvedValueOnce({ id: 10, status: OrderStatus.PENDING })
      .mockResolvedValueOnce({
        id: 10,
        userId: 7,
        total: 58_000,
        status: OrderStatus.PAID,
      });
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    tx.order.findUniqueOrThrow.mockResolvedValue({
      id: 10,
      userId: 7,
      status: OrderStatus.PAID,
      paymentMethod: PaymentMethod.WALLET,
      total: 58_000,
      paidAt: new Date(),
      createdAt: new Date(),
    });
    loyalty.awardPointsForPaidOrder.mockResolvedValue(5);
  });

  it('throws when the order does not belong to the current user', async () => {
    prisma.order.findFirst.mockResolvedValue(null);

    await expect(
      service.create(7, {
        orderId: 10,
        method: PaymentMethod.WALLET,
        simulateSuccess: true,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an order that is already paid', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 10,
      status: OrderStatus.PAID,
    });

    await expect(
      service.create(7, {
        orderId: 10,
        method: PaymentMethod.CARD,
        simulateSuccess: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('sets PAID through the state machine, deducts inventory, and awards points in the transaction', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 10,
      status: OrderStatus.PENDING,
    });
    const result = await service.create(
      7,
      {
        orderId: 10,
        method: PaymentMethod.WALLET,
        simulateSuccess: true,
      },
      'idem-key-1',
    );

    expect(result.status).toBe(OrderStatus.PAID);
    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: {
        id: 10,
        userId: 7,
      },
      select: {
        id: true,
        status: true,
      },
    });
    expect(inventory.deductForPaidOrder).toHaveBeenCalledWith(tx, 10);
    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10, status: OrderStatus.PENDING },
        data: expect.objectContaining({
          status: OrderStatus.PAID,
          paymentMethod: PaymentMethod.WALLET,
          paidAt: expect.any(Date),
        }),
      }),
    );
    expect(loyalty.awardPointsForPaidOrder).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ id: 10, userId: 7, total: 58_000 }),
    );
    expect(tx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 7,
          orderId: 10,
          idempotencyKey: 'idem-key-1',
          method: PaymentMethod.WALLET,
          simulateSuccess: true,
          amount: 58_000,
          status: OrderStatus.PAID,
        }),
      }),
    );
  });

  it('sets PAYMENT_FAILED without deducting inventory or awarding points when mock payment fails', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 10,
      status: OrderStatus.PENDING,
    });
    await service.create(7, {
      orderId: 10,
      method: PaymentMethod.CARD,
      simulateSuccess: false,
    });

    expect(inventory.deductForPaidOrder).not.toHaveBeenCalled();
    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10, status: OrderStatus.PENDING },
        data: expect.objectContaining({
          status: OrderStatus.PAYMENT_FAILED,
          paymentMethod: PaymentMethod.CARD,
          paidAt: null,
        }),
      }),
    );
    expect(loyalty.awardPointsForPaidOrder).not.toHaveBeenCalled();
  });

  it('allows a failed payment to be retried successfully', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 10,
      status: OrderStatus.PAYMENT_FAILED,
    });
    tx.order.findUnique
      .mockReset()
      .mockResolvedValueOnce({ id: 10, status: OrderStatus.PAYMENT_FAILED })
      .mockResolvedValueOnce({ id: 10, status: OrderStatus.PENDING })
      .mockResolvedValueOnce({ id: 10, status: OrderStatus.PENDING })
      .mockResolvedValue({
        id: 10,
        userId: 7,
        total: 58_000,
        status: OrderStatus.PAID,
      });
    tx.order.findUniqueOrThrow.mockResolvedValue({
      id: 10,
      userId: 7,
      status: OrderStatus.PAID,
      paymentMethod: PaymentMethod.CARD,
      total: 58_000,
      paidAt: new Date(),
      createdAt: new Date(),
    });

    await service.create(7, {
      orderId: 10,
      method: PaymentMethod.CARD,
      simulateSuccess: true,
    });

    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10, status: OrderStatus.PENDING },
        data: expect.objectContaining({
          status: OrderStatus.PAID,
          paidAt: expect.any(Date),
        }),
      }),
    );
    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10, status: OrderStatus.PAYMENT_FAILED },
        data: { status: OrderStatus.PENDING },
      }),
    );
    expect(loyalty.awardPointsForPaidOrder).toHaveBeenCalledTimes(1);
  });

  it('returns the saved response when the same Idempotency-Key and payload are replayed', async () => {
    const savedPaidAt = new Date('2026-10-31T05:00:00.000Z');
    const savedCreatedAt = new Date('2026-10-31T04:55:00.000Z');
    prisma.payment.findUnique.mockResolvedValue({
      id: 1,
      userId: 7,
      orderId: 10,
      idempotencyKey: 'replay-key',
      method: PaymentMethod.WALLET,
      simulateSuccess: true,
      amount: 58_000,
      status: OrderStatus.PAID,
      paidAt: savedPaidAt,
      createdAt: savedCreatedAt,
      order: { createdAt: savedCreatedAt },
    });

    const result = await service.create(
      7,
      {
        orderId: 10,
        method: PaymentMethod.WALLET,
        simulateSuccess: true,
      },
      'replay-key',
    );

    expect(result).toEqual({
      id: 10,
      userId: 7,
      status: OrderStatus.PAID,
      paymentMethod: PaymentMethod.WALLET,
      total: 58_000,
      paidAt: savedPaidAt,
      createdAt: savedCreatedAt,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(inventory.deductForPaidOrder).not.toHaveBeenCalled();
    expect(loyalty.awardPointsForPaidOrder).not.toHaveBeenCalled();
  });

  it('throws 409 ConflictException when the same Idempotency-Key is used with a different payload', async () => {
    prisma.payment.findUnique.mockResolvedValue({
      id: 1,
      userId: 7,
      orderId: 10,
      idempotencyKey: 'replay-key',
      method: PaymentMethod.WALLET,
      simulateSuccess: true,
      amount: 58_000,
      status: OrderStatus.PAID,
      paidAt: new Date(),
      createdAt: new Date(),
      order: { createdAt: new Date() },
    });

    await expect(
      service.create(
        7,
        {
          orderId: 10,
          method: PaymentMethod.CARD, // Different method
          simulateSuccess: true,
        },
        'replay-key',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an empty or whitespace-only Idempotency-Key with 400 BadRequestException', async () => {
    await expect(
      service.create(
        7,
        {
          orderId: 10,
          method: PaymentMethod.WALLET,
          simulateSuccess: true,
        },
        '   ',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
