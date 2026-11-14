import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrderStatus, type Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderStateService } from './order-state.service.js';

describe('OrderStateService', () => {
  const prisma = {
    order: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    ingredient: { update: vi.fn() },
    inventoryMovement: { create: vi.fn() },
    loyaltyTransaction: { findUnique: vi.fn(), updateMany: vi.fn() },
    payment: { findMany: vi.fn(), updateMany: vi.fn() },
    refund: { findUnique: vi.fn(), create: vi.fn() },
    pointCompensation: { findUnique: vi.fn(), create: vi.fn() },
    user: { update: vi.fn(), updateMany: vi.fn() },
  };
  let service: OrderStateService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.payment.findMany.mockResolvedValue([]);
    prisma.order.update.mockResolvedValue({ inventoryDeducted: false });
    service = new OrderStateService(prisma as unknown as PrismaService);
  });

  it.each([
    [OrderStatus.PENDING, OrderStatus.PAID],
    [OrderStatus.PENDING, OrderStatus.PAYMENT_FAILED],
    [OrderStatus.PENDING, OrderStatus.CANCELLED],

    [OrderStatus.PAYMENT_FAILED, OrderStatus.PENDING],
    [OrderStatus.PAYMENT_FAILED, OrderStatus.CANCELLED],
    [OrderStatus.PAID, OrderStatus.PREPARING],
    [OrderStatus.PREPARING, OrderStatus.READY],
    [OrderStatus.READY, OrderStatus.COMPLETED],
    [OrderStatus.PAID, OrderStatus.CANCELLED],
  ])('allows %s -> %s', (from, to) => {
    expect(() => service.assertTransition(from, to)).not.toThrow();
  });

  it.each([
    [OrderStatus.PENDING, OrderStatus.READY],
    [OrderStatus.PAID, OrderStatus.PENDING],
    [OrderStatus.PENDING, OrderStatus.PENDING],
    [OrderStatus.PAID, OrderStatus.PAID],
    [OrderStatus.READY, OrderStatus.READY],
    [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
    [OrderStatus.COMPLETED, OrderStatus.COMPLETED],
    [OrderStatus.CANCELLED, OrderStatus.PAID],
    [OrderStatus.CANCELLED, OrderStatus.CANCELLED],

    [OrderStatus.PREPARING, OrderStatus.CANCELLED],
    [OrderStatus.PAYMENT_FAILED, OrderStatus.PAID],
    [OrderStatus.PAYMENT_FAILED, OrderStatus.PAYMENT_FAILED],
  ])('rejects %s -> %s', (from, to) => {
    expect(() => service.assertTransition(from, to)).toThrow(ConflictException);
  });

  it.each([OrderStatus.PREPARING, OrderStatus.COMPLETED])(
    'does not update when cancelling %s',
    async (status) => {
      prisma.order.findUnique.mockResolvedValue({
        id: 8,
        status,
      });

      await expect(
        service.transition(8, OrderStatus.CANCELLED),
      ).rejects.toThrow(ConflictException);
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    },
  );

  it('hides orders owned by another customer, even after cancellation', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 8,
      userId: 7,
      status: OrderStatus.CANCELLED,
    });

    await expect(
      service.transition(8, OrderStatus.CANCELLED, undefined, {}, 9, 9),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it.each(['WALLET', 'CARD'])(
    'allows customers to cancel a paid simulated %s order without VNPay refund',
    async (paymentMethod) => {
      const paid = {
        id: 8,
        userId: 7,
        status: OrderStatus.PAID,
        inventoryDeducted: true,
        inventorySnapshot: [{ ingredientId: 1, amount: 10 }],
        paymentMethod,
      };
      const cancelled = { ...paid, status: OrderStatus.CANCELLED };
      prisma.order.findUnique
        .mockResolvedValueOnce(paid)
        .mockResolvedValueOnce(cancelled);
      prisma.ingredient.update.mockResolvedValue({ stock: 20 });
      prisma.loyaltyTransaction.findUnique.mockResolvedValue(null);
      prisma.order.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.transition(8, OrderStatus.CANCELLED, undefined, {}, 7, 7),
      ).resolves.toEqual(cancelled);
      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: 8, status: OrderStatus.PAID },
        data: { status: OrderStatus.CANCELLED },
      });
      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
      expect(prisma.refund.create).not.toHaveBeenCalled();
    },
  );

  it('does not create a refund when a pending VNPay checkout is cancelled', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 8,
      userId: 7,
      status: OrderStatus.PENDING,
      paymentMethod: 'VNPAY',
    });
    prisma.order.updateMany.mockResolvedValue({ count: 1 });
    await service.transition(8, OrderStatus.CANCELLED);
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
    expect(prisma.refund.create).not.toHaveBeenCalled();
  });

  it('preserves an existing legacy cash Refund and does not credit the same Payment again', async () => {
    const paid = {
      id: 8,
      userId: 7,
      status: OrderStatus.PAID,
      paymentMethod: 'VNPAY',
      total: 125000,
      inventoryDeducted: true,
      inventorySnapshot: [{ ingredientId: 1, amount: 10 }],
    };
    prisma.order.findUnique
      .mockResolvedValueOnce(paid)
      .mockResolvedValueOnce({ ...paid, status: OrderStatus.CANCELLED });
    prisma.ingredient.update.mockResolvedValue({ stock: 20 });
    prisma.loyaltyTransaction.findUnique.mockResolvedValue(null);
    prisma.order.updateMany.mockResolvedValue({ count: 1 });
    prisma.payment.findMany.mockResolvedValue([
      {
        id: 55,
        amount: 125000,
        providerTxnRef: 'BL-8',
        orderId: 8,
        userId: 7,
        method: 'VNPAY',
        status: 'PAID',
      },
    ]);
    prisma.refund.findUnique.mockResolvedValue({ id: 100, status: 'PENDING' });

    await service.transition(8, OrderStatus.CANCELLED);

    expect(prisma.refund.create).not.toHaveBeenCalled();
    expect(prisma.pointCompensation.create).not.toHaveBeenCalled();
  });

  it('converts a definitively failed legacy Refund into points when cancelling', async () => {
    const paid = {
      id: 8,
      userId: 7,
      status: OrderStatus.PAID,
      paymentMethod: 'VNPAY',
      total: 125000,
      inventoryDeducted: true,
      inventorySnapshot: [{ ingredientId: 1, amount: 10 }],
    };
    prisma.order.findUnique
      .mockResolvedValueOnce(paid)
      .mockResolvedValueOnce({ ...paid, status: OrderStatus.CANCELLED });
    prisma.ingredient.update.mockResolvedValue({ stock: 20 });
    prisma.loyaltyTransaction.findUnique.mockResolvedValue(null);
    prisma.order.updateMany.mockResolvedValue({ count: 1 });
    prisma.payment.findMany.mockResolvedValue([
      {
        id: 55,
        amount: 125000,
        providerTxnRef: 'BL-8',
        orderId: 8,
        userId: 7,
        method: 'VNPAY',
        status: 'PAID',
      },
    ]);
    prisma.refund.findUnique.mockResolvedValue({ id: 100, status: 'FAILED' });

    await service.transition(8, OrderStatus.CANCELLED);

    expect(prisma.pointCompensation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentId: 55,
        type: 'REFUND_CREDIT',
        amount: 125000,
        points: 1250,
      }),
    });
  });

  it.each([
    { source: 'CUSTOMER' as const, actorId: 7, customerId: 7 },
    { source: 'STAFF' as const, actorId: 99, customerId: undefined },
  ])(
    'credits every previously paid VNPay Payment once when $source cancels',
    async ({ source, actorId, customerId }) => {
      const paid = {
        id: 8,
        userId: 7,
        status: OrderStatus.PAID,
        paymentMethod: 'VNPAY',
        total: 125000,
        inventoryDeducted: true,
        inventorySnapshot: [{ ingredientId: 1, amount: 10 }],
      };
      const cancelled = { ...paid, status: OrderStatus.CANCELLED };
      prisma.order.findUnique
        .mockResolvedValueOnce(paid)
        .mockResolvedValueOnce(cancelled);
      prisma.ingredient.update.mockResolvedValue({ stock: 20 });
      prisma.loyaltyTransaction.findUnique.mockResolvedValue(null);
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
      prisma.payment.findMany.mockResolvedValue([
        {
          id: 55,
          orderId: 8,
          userId: 7,
          amount: 125000,
          method: 'VNPAY',
          status: 'PAID',
        },
        {
          id: 56,
          orderId: 8,
          userId: 7,
          amount: 10001,
          method: 'VNPAY',
          status: 'PAID',
        },
      ]);
      prisma.refund.findUnique.mockResolvedValue(null);
      prisma.pointCompensation.findUnique.mockResolvedValue(null);

      await service.transition(
        8,
        OrderStatus.CANCELLED,
        undefined,
        {
          cancellationSource: source,
          cancellationReason: 'Khách yêu cầu hủy',
        },
        actorId,
        customerId,
      );

      expect(prisma.refund.create).not.toHaveBeenCalled();
      expect(prisma.pointCompensation.create).toHaveBeenCalledTimes(2);
      expect(prisma.pointCompensation.create).toHaveBeenNthCalledWith(1, {
        data: expect.objectContaining({
          paymentId: 55,
          points: 1250,
          idempotencyKey: 'REFUND_CREDIT:55',
        }),
      });
      expect(prisma.pointCompensation.create).toHaveBeenNthCalledWith(2, {
        data: expect.objectContaining({
          paymentId: 56,
          points: 101,
          idempotencyKey: 'REFUND_CREDIT:56',
        }),
      });
      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: 8, status: OrderStatus.PAID },
        data: expect.objectContaining({ status: OrderStatus.CANCELLED }),
      });
    },
  );

  it('blocks customers from cancelling after the shop starts preparing', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 8,
      userId: 7,
      status: OrderStatus.PREPARING,
    });

    await expect(
      service.transition(8, OrderStatus.CANCELLED, undefined, {}, 7, 7),
    ).rejects.toThrow(ConflictException);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('returns the original cancellation on a repeated customer request', async () => {
    const order = { id: 8, userId: 7, status: OrderStatus.CANCELLED };
    prisma.order.findUnique.mockResolvedValue(order);

    await expect(
      service.transition(8, OrderStatus.CANCELLED, undefined, {}, 7, 7),
    ).resolves.toEqual(order);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('updates only if the previously read status is still current', async () => {
    prisma.order.findUnique.mockResolvedValueOnce({
      id: 8,
      status: OrderStatus.PENDING,
    });
    prisma.order.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.transition(
        8,
        OrderStatus.PAID,
        prisma as unknown as Prisma.TransactionClient,
      ),
    ).rejects.toThrow(ConflictException);
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 8, status: OrderStatus.PENDING },
      data: { status: OrderStatus.PAID },
    });
  });

  it('throws NotFoundException when the order does not exist', async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    await expect(service.transition(8, OrderStatus.PAID)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });
});
