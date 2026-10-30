import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PromotionsService } from '../promotions/promotions.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';

const SIZE_EXTRA: Record<CreateOrderDto['items'][number]['size'], number> = {
  S: 0,
  M: 5_000,
  L: 10_000,
};

const TOPPING_PRICE: Record<string, number> = {
  pearls: 8_000,
  cream: 10_000,
  jelly: 7_000,
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly promotionsService: PromotionsService,
  ) {}

  async create(userId: number, dto: CreateOrderDto) {
    return this.prisma.$transaction(async (transaction) => {
      const productIds = [...new Set(dto.items.map((item) => item.productId))];
      const products = await transaction.product.findMany({
        where: { id: { in: productIds } },
      });
      const productsById = new Map(products.map((product) => [product.id, product]));

      for (const productId of productIds) {
        if (!productsById.has(productId)) {
          throw new NotFoundException(`Không tìm thấy sản phẩm ${productId}.`);
        }
      }

      const requestedByProduct = new Map<number, number>();
      for (const item of dto.items) {
        requestedByProduct.set(
          item.productId,
          (requestedByProduct.get(item.productId) ?? 0) + item.quantity,
        );
      }

      for (const [productId, requestedQuantity] of requestedByProduct) {
        const product = productsById.get(productId)!;
        if (requestedQuantity > product.stock) {
          throw new BadRequestException(
            `Sản phẩm ${product.name} chỉ còn ${product.stock} món.`,
          );
        }
      }

      const orderItems = dto.items.map((item) => {
        const product = productsById.get(item.productId)!;
        const toppings = [...item.toppings].sort();
        const unitPrice =
          product.price +
          SIZE_EXTRA[item.size] +
          toppings.reduce((total, toppingId) => total + TOPPING_PRICE[toppingId], 0);

        return {
          productId: item.productId,
          size: item.size,
          toppings,
          quantity: item.quantity,
          unitPrice,
          lineTotal: unitPrice * item.quantity,
        };
      });
      const subtotal = orderItems.reduce((sum, item) => sum + item.lineTotal, 0);
      const promotion = dto.promotionCode
        ? await this.promotionsService.validateAndCalculate(
            dto.promotionCode,
            subtotal,
            transaction,
          )
        : null;
      const discountAmount = promotion?.discountAmount ?? 0;
      const total = subtotal - discountAmount;

      return transaction.order.create({
        data: {
          userId,
          status: OrderStatus.PENDING,
          promotionCode: promotion?.code ?? null,
          subtotal,
          discountAmount,
          total,
          items: { create: orderItems },
        },
        select: {
          id: true,
          userId: true,
          status: true,
          promotionCode: true,
          subtotal: true,
          discountAmount: true,
          total: true,
          createdAt: true,
          items: {
            select: {
              productId: true,
              size: true,
              toppings: true,
              quantity: true,
              unitPrice: true,
              lineTotal: true,
            },
          },
        },
      });
    });
  }
}
