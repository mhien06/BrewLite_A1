import { Injectable, Logger } from '@nestjs/common';
import { OrderStatus, Prisma } from '../generated/prisma/client.js';
import { OrderStateService } from '../orders/order-state.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Không giữ kho khi chỉ thêm vào giỏ. Đơn chưa trả tiền cũng chưa trừ kho.
export function paymentDeadline(
  createdAt: Date,
  expiresAt?: Date | null,
): Date {
  const configured = Number(process.env.VNPAY_PAYMENT_EXPIRY_MINUTES ?? 15);
  const minutes =
    Number.isSafeInteger(configured) && configured > 0 ? configured : 15;
  return expiresAt ?? new Date(createdAt.getTime() + minutes * 60_000);
}

@Injectable()
export class OrderExpiryService {
  private readonly logger = new Logger(OrderExpiryService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly states: OrderStateService,
  ) {}

  async expireDueOrders(now = new Date()): Promise<void> {
    const cutoff = new Date(
      now.getTime() - (paymentDeadline(now).getTime() - now.getTime()),
    );
    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.PENDING, OrderStatus.PAYMENT_FAILED] },
        OR: [
          {
            createdAt: { lte: cutoff },
            payments: { none: { expiresAt: { not: null } } },
          },
          {
            AND: [
              { payments: { some: { expiresAt: { lte: now } } } },
              { payments: { none: { expiresAt: { gt: now } } } },
            ],
          },
        ],
      },
      select: { id: true },
      take: 100,
      orderBy: { id: 'asc' },
    });
    for (const order of orders) {
      try {
        await this.prisma.$transaction((tx) =>
          this.expireOrder(tx, order.id, now),
        );
      } catch {
        this.logger.error(
          `Chưa xử lý được đơn quá hạn #${order.id}; sẽ kiểm tra lại.`,
        );
      }
    }
  }

  async expireOrder(tx: Prisma.TransactionClient, orderId: number, now: Date) {
    await tx.$executeRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (
      !order ||
      !(
        [OrderStatus.PENDING, OrderStatus.PAYMENT_FAILED] as OrderStatus[]
      ).includes(order.status)
    )
      return false;
    const latest = await tx.payment.findFirst({
      where: { orderId },
      orderBy: { id: 'desc' },
    });
    if (
      paymentDeadline(order.createdAt, latest?.expiresAt).getTime() >
      now.getTime()
    )
      return false;
    await this.states.transition(orderId, OrderStatus.CANCELLED, tx, {
      cancelledAt: now,
      cancellationSource: 'SYSTEM',
      cancelledById: null,
      cancellationReason: 'Hết thời hạn thanh toán.',
    });
    // Giữ Payment đang chờ để vẫn tiếp nhận và đối soát callback đến trễ.
    return true;
  }
}
