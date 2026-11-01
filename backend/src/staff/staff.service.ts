import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrderStateService } from '../orders/order-state.service.js';
import { AdjustStockDto, UpdateOrderStatusDto } from './staff.dto.js';

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly states: OrderStateService,
  ) {}

  ingredients() {
    return this.prisma.ingredient.findMany({ orderBy: { id: 'asc' } });
  }
  recipes() {
    return this.prisma.product.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        recipes: { include: { ingredient: true } },
      },
    });
  }
  toppingRecipes() {
    return this.prisma.toppingIngredient.findMany({
      include: { ingredient: true },
      orderBy: { id: 'asc' },
    });
  }
  movements() {
    return this.prisma.inventoryMovement.findMany({
      take: 100,
      orderBy: { id: 'desc' },
      include: {
        ingredient: { select: { name: true, unit: true } },
        actor: { select: { name: true } },
      },
    });
  }
  async adjustStock(
    actorId: number,
    ingredientId: number,
    dto: AdjustStockDto,
  ) {
    if (dto.delta === 0)
      throw new BadRequestException('Lượng điều chỉnh phải khác 0.');
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.ingredient.findUnique({
        where: { id: ingredientId },
      });
      if (!item) throw new NotFoundException('Không tìm thấy nguyên liệu.');
      if (item.version !== dto.version)
        throw new ConflictException(
          'Kho đã thay đổi. Tải lại trước khi điều chỉnh.',
        );
      const after = item.stock + dto.delta;
      if (after < 0 || after > 2147483647)
        throw new BadRequestException('Tồn kho sau điều chỉnh không hợp lệ.');
      // Không ghi đè thay đổi của một lần thanh toán hoặc một nhân viên khác.
      const result = await tx.ingredient.updateMany({
        where: { id: ingredientId, version: dto.version },
        data: { stock: after, version: { increment: 1 } },
      });
      if (result.count !== 1)
        throw new ConflictException(
          'Kho đã thay đổi. Tải lại trước khi điều chỉnh.',
        );
      return tx.inventoryMovement.create({
        data: {
          ingredientId,
          actorId,
          delta: dto.delta,
          before: item.stock,
          after,
          reason: dto.reason,
        },
      });
    });
  }
  orders() {
    return this.prisma.order.findMany({
      take: 100,
      orderBy: { id: 'desc' },
      where: { status: { in: ['PAID', 'PREPARING', 'READY', 'COMPLETED'] } },
      include: {
        user: { select: { name: true } },
        items: { include: { product: { select: { name: true } } } },
      },
    });
  }
  updateStatus(id: number, dto: UpdateOrderStatusDto) {
    // Chỉ nhận pha, pha xong và giao khách. Không cho nhân viên tự đánh dấu PAID.
    return this.states.transition(id, dto.status);
  }
  loyalty() {
    return this.prisma.user.findMany({
      orderBy: { id: 'asc' },
      take: 200,
      select: {
        id: true,
        name: true,
        email: true,
        loyaltyPoints: true,
        loyaltyTransactions: {
          take: 30,
          orderBy: { id: 'desc' },
          select: { orderId: true, points: true, createdAt: true },
        },
      },
    });
  }
}
