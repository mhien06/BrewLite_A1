import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const VALID_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  [OrderStatus.PENDING]: [
    OrderStatus.PAID,
    OrderStatus.PAYMENT_FAILED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.PAYMENT_FAILED]: [
    OrderStatus.PAID,
    OrderStatus.PAYMENT_FAILED,
    OrderStatus.PENDING,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.PAID]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
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

  async transition(
    orderId: number,
    to: OrderStatus,
    tx: Prisma.TransactionClient = this.prisma,
    extraData: Omit<Prisma.OrderUpdateManyMutationInput, 'status'> = {},
  ) {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
    });

    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }

    this.assertTransition(order.status, to);
    const result = await tx.order.updateMany({
      where: { id: orderId, status: order.status },
      data: { ...extraData, status: to },
    });

    if (result.count === 0) {
      throw new ConflictException(
        'Trạng thái đơn hàng đã thay đổi. Vui lòng thử lại.',
      );
    }

    const updatedOrder = await tx.order.findUnique({ where: { id: orderId } });
    if (!updatedOrder) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }
    return updatedOrder;
  }
}
