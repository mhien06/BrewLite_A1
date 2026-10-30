import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrderStatus, PaymentMethod } from '../generated/prisma/client.js';
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
  };
  const prisma = {
    order: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(tx)),
  };
  const loyalty = {
    awardPointsForPaidOrder: vi.fn(),
  };

  let service: PaymentsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PaymentsService(
      prisma as unknown as PrismaService,
      new OrderStateService(prisma as unknown as PrismaService),
      loyalty as unknown as LoyaltyService,
    );
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

  it('sets PAID through the state machine and awards points in the transaction', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 10,
      status: OrderStatus.PENDING,
    });
    const result = await service.create(7, {
      orderId: 10,
      method: PaymentMethod.WALLET,
      simulateSuccess: true,
    });

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
  });

  it('sets PAYMENT_FAILED without awarding points when mock payment fails', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 10,
      status: OrderStatus.PENDING,
    });
    await service.create(7, {
      orderId: 10,
      method: PaymentMethod.CARD,
      simulateSuccess: false,
    });

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
      .mockResolvedValue({ id: 10, userId: 7, total: 58_000, status: OrderStatus.PAID });
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
        where: { id: 10, status: OrderStatus.PAYMENT_FAILED },
        data: expect.objectContaining({
          status: OrderStatus.PAID,
          paidAt: expect.any(Date),
        }),
      }),
    );
    expect(loyalty.awardPointsForPaidOrder).toHaveBeenCalledTimes(1);
  });
});
