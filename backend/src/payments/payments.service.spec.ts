import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrderStatus, PaymentMethod } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentsService } from './payments.service.js';

describe('PaymentsService', () => {
  const prisma = {
    order: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };

  let service: PaymentsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PaymentsService(prisma as unknown as PrismaService);
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

    expect(prisma.order.update).not.toHaveBeenCalled();
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

    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('sets PAID and paidAt when mock payment succeeds', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 10,
      status: OrderStatus.PENDING,
    });
    prisma.order.update.mockResolvedValue({
      id: 10,
      status: OrderStatus.PAID,
    });

    await service.create(7, {
      orderId: 10,
      method: PaymentMethod.WALLET,
      simulateSuccess: true,
    });

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
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10 },
        data: {
          status: OrderStatus.PAID,
          paymentMethod: PaymentMethod.WALLET,
          paidAt: expect.any(Date),
        },
      }),
    );
  });

  it('sets PAYMENT_FAILED and keeps paidAt null when mock payment fails', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 10,
      status: OrderStatus.PENDING,
    });
    prisma.order.update.mockResolvedValue({
      id: 10,
      status: OrderStatus.PAYMENT_FAILED,
    });

    await service.create(7, {
      orderId: 10,
      method: PaymentMethod.CARD,
      simulateSuccess: false,
    });

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10 },
        data: {
          status: OrderStatus.PAYMENT_FAILED,
          paymentMethod: PaymentMethod.CARD,
          paidAt: null,
        },
      }),
    );
  });

  it('allows a failed payment to be retried successfully', async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: 10,
      status: OrderStatus.PAYMENT_FAILED,
    });
    prisma.order.update.mockResolvedValue({
      id: 10,
      status: OrderStatus.PAID,
    });

    await service.create(7, {
      orderId: 10,
      method: PaymentMethod.CARD,
      simulateSuccess: true,
    });

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OrderStatus.PAID,
          paidAt: expect.any(Date),
        }),
      }),
    );
  });
});
