import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '../generated/prisma/client.js';
import { LoyaltyService } from '../loyalty/loyalty.service.js';
import { OrderStateService } from '../orders/order-state.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderState: OrderStateService,
    private readonly loyalty: LoyaltyService,
  ) {}

  async create(userId: number, dto: CreatePaymentDto) {
    const order = await this.prisma.order.findFirst({
      where: {
        id: dto.orderId,
        userId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Không tìm thấy đơn hàng.');
    }

    if (order.status === OrderStatus.PAID) {
      throw new ConflictException('Đơn hàng đã được thanh toán.');
    }

    const status = dto.simulateSuccess
      ? OrderStatus.PAID
      : OrderStatus.PAYMENT_FAILED;

    return this.prisma.$transaction(async (tx) => {
      const updatedOrder = await this.orderState.transition(
        order.id,
        status,
        tx,
        {
          paymentMethod: dto.method,
          paidAt: status === OrderStatus.PAID ? new Date() : null,
        },
      );

      if (status === OrderStatus.PAID) {
        await this.loyalty.awardPointsForPaidOrder(tx, updatedOrder);
      }

      return tx.order.findUniqueOrThrow({
        where: { id: order.id },
        select: {
          id: true,
          userId: true,
          status: true,
          paymentMethod: true,
          total: true,
          paidAt: true,
          createdAt: true,
        },
      });
    });
  }
}
