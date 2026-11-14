import { ConflictException, Injectable } from '@nestjs/common';
import {
  OrderStatus,
  PaymentMethod,
  PointCompensationType,
  Prisma,
} from '../generated/prisma/client.js';

export const VND_PER_REFUND_POINT = 100;

@Injectable()
export class PointCompensationService {
  async reverseEarnedPoints(
    tx: Prisma.TransactionClient,
    order: { id: number; userId: number },
  ): Promise<number> {
    const earned = await tx.loyaltyTransaction.findUnique({
      where: { orderId: order.id },
    });
    if (!earned || earned.reversed) return 0;

    const reversed = await tx.loyaltyTransaction.updateMany({
      where: { orderId: order.id, reversed: false },
      data: { reversed: true },
    });
    if (!reversed.count) return 0;

    const balance = await tx.user.updateMany({
      where: { id: order.userId, loyaltyPoints: { gte: earned.points } },
      data: { loyaltyPoints: { decrement: earned.points } },
    });
    if (!balance.count) {
      throw new ConflictException(
        'Không thể thu hồi điểm thưởng vì số dư hiện tại không đủ. Đơn chưa bị hủy.',
      );
    }
    return earned.points;
  }

  async restoreRedeemedPoints(
    tx: Prisma.TransactionClient,
    order: {
      id: number;
      userId: number;
      loyaltyPointsUsed: number;
      loyaltyPointsRestored: boolean;
    },
  ): Promise<number> {
    if (
      !Number.isSafeInteger(order.loyaltyPointsUsed) ||
      order.loyaltyPointsUsed <= 0 ||
      order.loyaltyPointsRestored
    ) {
      return 0;
    }

    const claimed = await tx.order.updateMany({
      where: { id: order.id, loyaltyPointsRestored: false },
      data: { loyaltyPointsRestored: true },
    });
    if (!claimed.count) return 0;

    await tx.pointCompensation.create({
      data: {
        userId: order.userId,
        orderId: order.id,
        type: PointCompensationType.RESTORE,
        points: order.loyaltyPointsUsed,
        note: `Trả lại ${order.loyaltyPointsUsed} điểm đã dùng cho đơn #${order.id}`,
        idempotencyKey: `RESTORE:${order.id}`,
      },
    });
    await tx.user.update({
      where: { id: order.userId },
      data: { loyaltyPoints: { increment: order.loyaltyPointsUsed } },
    });
    return order.loyaltyPointsUsed;
  }

  async creditPaidVnpayPayment(
    tx: Prisma.TransactionClient,
    payment: {
      id: number;
      orderId: number;
      userId: number;
      method: PaymentMethod;
      status: OrderStatus;
      amount: number;
    },
  ): Promise<number> {
    if (
      payment.method !== PaymentMethod.VNPAY ||
      payment.status !== OrderStatus.PAID ||
      !Number.isSafeInteger(payment.amount) ||
      payment.amount <= 0
    ) {
      return 0;
    }

    const existing = await tx.pointCompensation.findUnique({
      where: { paymentId: payment.id },
      select: { id: true },
    });
    if (existing) return 0;

    const points = Math.ceil(payment.amount / VND_PER_REFUND_POINT);
    await tx.pointCompensation.create({
      data: {
        userId: payment.userId,
        orderId: payment.orderId,
        paymentId: payment.id,
        type: PointCompensationType.REFUND_CREDIT,
        points,
        amount: payment.amount,
        note: `Hoàn giá trị đơn hàng #${payment.orderId}`,
        idempotencyKey: `REFUND_CREDIT:${payment.id}`,
      },
    });
    await tx.user.update({
      where: { id: payment.userId },
      data: { loyaltyPoints: { increment: points } },
    });
    return points;
  }
}
