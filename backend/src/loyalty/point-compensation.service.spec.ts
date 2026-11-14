import { ConflictException } from '@nestjs/common';
import {
  OrderStatus,
  PaymentMethod,
  PointCompensationType,
} from '../generated/prisma/client.js';
import { describe, expect, it, vi } from 'vitest';
import { PointCompensationService } from './point-compensation.service.js';

describe('PointCompensationService', () => {
  const makeDb = () => ({
    pointCompensation: { findUnique: vi.fn(), create: vi.fn() },
    user: { update: vi.fn(), updateMany: vi.fn() },
    loyaltyTransaction: { findUnique: vi.fn(), updateMany: vi.fn() },
    order: { updateMany: vi.fn() },
  });

  it('credits each paid VNPay amount at 100 VND per point and rounds up', async () => {
    const db = makeDb();
    db.pointCompensation.findUnique.mockResolvedValue(null);
    db.pointCompensation.create.mockResolvedValue({ id: 1 });
    const service = new PointCompensationService();

    await expect(
      service.creditPaidVnpayPayment(db as never, {
        id: 12,
        orderId: 8,
        userId: 7,
        method: PaymentMethod.VNPAY,
        status: OrderStatus.PAID,
        amount: 10_001,
      }),
    ).resolves.toBe(101);

    expect(db.pointCompensation.create).toHaveBeenCalledWith({
      data: {
        userId: 7,
        orderId: 8,
        paymentId: 12,
        type: PointCompensationType.REFUND_CREDIT,
        points: 101,
        amount: 10_001,
        note: 'Hoàn giá trị đơn hàng #8',
        idempotencyKey: 'REFUND_CREDIT:12',
      },
    });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { loyaltyPoints: { increment: 101 } },
    });
  });

  it('does not credit a payment twice', async () => {
    const db = makeDb();
    db.pointCompensation.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 1 });
    db.pointCompensation.create.mockResolvedValue({ id: 1 });
    const service = new PointCompensationService();
    const payment = {
      id: 12,
      orderId: 8,
      userId: 7,
      method: PaymentMethod.VNPAY,
      status: OrderStatus.PAID,
      amount: 10_000,
    };

    await service.creditPaidVnpayPayment(db as never, payment);
    await expect(
      service.creditPaidVnpayPayment(db as never, payment),
    ).resolves.toBe(0);
    expect(db.pointCompensation.create).toHaveBeenCalledTimes(1);
    expect(db.user.update).toHaveBeenCalledTimes(1);
  });

  it('does not credit a pending or non-VNPay payment', async () => {
    const db = makeDb();
    const service = new PointCompensationService();
    await expect(
      service.creditPaidVnpayPayment(db as never, {
        id: 1,
        orderId: 2,
        userId: 3,
        method: PaymentMethod.CARD,
        status: OrderStatus.PAID,
        amount: 1000,
      }),
    ).resolves.toBe(0);
    await expect(
      service.creditPaidVnpayPayment(db as never, {
        id: 1,
        orderId: 2,
        userId: 3,
        method: PaymentMethod.VNPAY,
        status: OrderStatus.PENDING,
        amount: 1000,
      }),
    ).resolves.toBe(0);
    expect(db.pointCompensation.create).not.toHaveBeenCalled();
  });

  it('restores redeemed points once and records the reason', async () => {
    const db = makeDb();
    db.order.updateMany.mockResolvedValue({ count: 1 });
    const service = new PointCompensationService();

    await expect(
      service.restoreRedeemedPoints(db as never, {
        id: 8,
        userId: 7,
        loyaltyPointsUsed: 25,
        loyaltyPointsRestored: false,
      }),
    ).resolves.toBe(25);

    expect(db.pointCompensation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: PointCompensationType.RESTORE,
        points: 25,
        idempotencyKey: 'RESTORE:8',
      }),
    });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { loyaltyPoints: { increment: 25 } },
    });
  });

  it('reverses earned points once without allowing a negative balance', async () => {
    const db = makeDb();
    db.loyaltyTransaction.findUnique.mockResolvedValue({
      orderId: 8,
      points: 4,
      reversed: false,
    });
    db.loyaltyTransaction.updateMany.mockResolvedValue({ count: 1 });
    db.user.updateMany.mockResolvedValue({ count: 0 });
    const service = new PointCompensationService();

    await expect(
      service.reverseEarnedPoints(db as never, { id: 8, userId: 7 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.user.updateMany).toHaveBeenCalledWith({
      where: { id: 7, loyaltyPoints: { gte: 4 } },
      data: { loyaltyPoints: { decrement: 4 } },
    });
  });
});
