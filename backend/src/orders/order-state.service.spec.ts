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
    },
  };
  let service: OrderStateService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OrderStateService(prisma as unknown as PrismaService);
  });

  it.each([
    [OrderStatus.PENDING, OrderStatus.PAID],
    [OrderStatus.PENDING, OrderStatus.PAYMENT_FAILED],
    [OrderStatus.PENDING, OrderStatus.CANCELLED],
    [OrderStatus.PAYMENT_FAILED, OrderStatus.PAID],
    [OrderStatus.PAYMENT_FAILED, OrderStatus.PAYMENT_FAILED],
    [OrderStatus.PAYMENT_FAILED, OrderStatus.PENDING],
    [OrderStatus.PAYMENT_FAILED, OrderStatus.CANCELLED],
    [OrderStatus.PAID, OrderStatus.PREPARING],
    [OrderStatus.PAID, OrderStatus.CANCELLED],
    [OrderStatus.PREPARING, OrderStatus.READY],
    [OrderStatus.PREPARING, OrderStatus.CANCELLED],
    [OrderStatus.READY, OrderStatus.COMPLETED],
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
  ])('rejects %s -> %s', (from, to) => {
    expect(() => service.assertTransition(from, to)).toThrow(ConflictException);
  });

  it('does not attempt a database update for an invalid transition', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 8,
      status: OrderStatus.COMPLETED,
    });

    await expect(service.transition(8, OrderStatus.CANCELLED)).rejects.toThrow(
      ConflictException,
    );
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
