import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const VALID_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  [OrderStatus.PENDING]: [
    OrderStatus.PAID,
    OrderStatus.PAYMENT_FAILED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.PAYMENT_FAILED]: [OrderStatus.PENDING, OrderStatus.CANCELLED],
  [OrderStatus.PAID]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY],
  [OrderStatus.READY]: [OrderStatus.COMPLETED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
};

@Injectable()
export class OrderStateService {
  constructor(private readonly prisma: PrismaService) {}

  assertTransition(from: OrderStatus, to: OrderStatus): void {
    if (!VALID_TRANSITIONS[from].includes(to)) {
      throw new ConflictException(
        `Không thể chuyển trạng thái đơn hàng từ ${from} sang ${to}.`,
      );
    }
  }

  private async restorePaidOrder(
    tx: Prisma.TransactionClient,
    order: Prisma.OrderGetPayload<object>,
    actorId: number,
  ) {
    if (!order.inventoryDeducted)
      throw new ConflictException(
        'Đơn thiếu thông tin trừ kho. Không thể tự động hủy.',
      );
    const snapshot = order.inventorySnapshot;
    if (!Array.isArray(snapshot) || snapshot.length === 0) {
      throw new ConflictException(
        'Đơn cũ chưa có lịch sử lượng kho đã trừ. Cần đối soát trước khi hủy.',
      );
    }
    const amounts = snapshot
      .map((entry) => {
        if (
          !entry ||
          typeof entry !== 'object' ||
          Array.isArray(entry) ||
          typeof entry.ingredientId !== 'number' ||
          !Number.isSafeInteger(entry.ingredientId) ||
          entry.ingredientId <= 0 ||
          typeof entry.amount !== 'number' ||
          !Number.isSafeInteger(entry.amount) ||
          entry.amount <= 0
        ) {
          throw new ConflictException('Lịch sử kho không hợp lệ.');
        }
        return { ingredientId: entry.ingredientId, amount: entry.amount };
      })
      .sort((a, b) => a.ingredientId - b.ingredientId);
    for (const entry of amounts) {
      const updated = await tx.ingredient.update({
        where: { id: entry.ingredientId },
        data: { stock: { increment: entry.amount }, version: { increment: 1 } },
      });
      await tx.inventoryMovement.create({
        data: {
          ingredientId: entry.ingredientId,
          actorId,
          delta: entry.amount,
          before: updated.stock - entry.amount,
          after: updated.stock,
          reason: `Hoàn kho hủy đơn #${order.id}`,
        },
      });
    }
    const earned = await tx.loyaltyTransaction.findUnique({
      where: { orderId: order.id },
    });
    if (earned && !earned.reversed) {
      await tx.loyaltyTransaction.update({
        where: { orderId: order.id },
        data: { reversed: true },
      });
      await tx.user.update({
        where: { id: order.userId },
        data: { loyaltyPoints: { decrement: earned.points } },
      });
    }
    await tx.order.update({
      where: { id: order.id },
      data: { inventoryDeducted: false },
    });
    // Payment giữ kết quả gốc cho idempotency; hủy đơn không khẳng định đã hoàn tiền.
  }

  async transition(
    orderId: number,
    to: OrderStatus,
    tx?: Prisma.TransactionClient,
    extraData: Omit<Prisma.OrderUpdateManyMutationInput, 'status'> = {},
    actorId?: number,
  ): Promise<Prisma.OrderGetPayload<object>> {
    if (!tx && typeof this.prisma.$transaction === 'function') {
      return this.prisma.$transaction(
        (transaction) => this.transition(orderId, to, transaction, extraData, actorId),
        { timeout: 20000 },
      );
    }
    const db = tx ?? this.prisma;
    // Cùng khóa với thanh toán: nhận pha và hủy không thể cùng thắng.
    if (typeof db.$executeRaw === 'function') {
      await db.$executeRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    }
    const order = await db.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }

    // Gửi lại yêu cầu hủy chỉ trả trạng thái cũ, không hoàn lần nữa.
    if (order.status === OrderStatus.CANCELLED && to === OrderStatus.CANCELLED)
      return order;
    this.assertTransition(order.status, to);
    if (to === OrderStatus.CANCELLED && order.status === OrderStatus.PAID) {
      await this.restorePaidOrder(db, order, actorId ?? order.userId);
    }
    const result = await db.order.updateMany({
      where: { id: orderId, status: order.status },
      data: { ...extraData, status: to },
    });

    if (result.count === 0) {
      throw new ConflictException(
        'Trạng thái đơn hàng đã thay đổi. Vui lòng thử lại.',
      );
    }

    const updatedOrder = await db.order.findUnique({ where: { id: orderId } });
    if (!updatedOrder) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }
    return updatedOrder;
  }
}
