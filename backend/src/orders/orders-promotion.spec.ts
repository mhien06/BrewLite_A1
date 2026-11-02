import { OrderStatus, PromotionType } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PromotionsService } from '../promotions/promotions.service.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrdersService } from './orders.service.js';

describe('OrdersService promotions', () => {
  const product = { id: 1, name: 'Cà phê sữa', price: 29_000, stock: 5 };
  const promotion = {
    id: 1,
    code: 'BREW10',
    type: PromotionType.PERCENT,
    value: 10,
    minOrderTotal: 0,
    maxDiscount: 20_000,
    startsAt: null,
    expiresAt: null,
    isActive: true,
    createdAt: new Date(),
  };
  const tx = {
    product: { findMany: vi.fn() },
    promotion: { findUnique: vi.fn() },
    order: { create: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn((callback) => callback(tx)),
  };
  const promotionsService = new PromotionsService(
    prisma as unknown as PrismaService,
  );
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    promotionsService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    tx.product.findMany.mockResolvedValue([product]);
    tx.promotion.findUnique.mockResolvedValue(promotion);
    tx.order.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 10,
        userId: data.userId,
        status: data.status,
        promotionCode: data.promotionCode,
        subtotal: data.subtotal,
        discountAmount: data.discountAmount,
        total: data.total,
        createdAt: new Date(),
        items: data.items.create,
      }),
    );
  });

  it('creates a discounted order using backend product prices and returns added fields', async () => {
    const result = await service.create(7, {
      items: [{ productId: 1, size: 'M', quantity: 2, toppings: ['pearls'] }],
      promotionCode: 'brew10',
    });

    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OrderStatus.PENDING,
          promotionCode: 'BREW10',
          subtotal: 84_000,
          discountAmount: 8_400,
          total: 75_600,
        }),
        select: expect.objectContaining({
          promotionCode: true,
          subtotal: true,
          discountAmount: true,
          total: true,
        }),
      }),
    );
    expect(result.total).toBe(75_600);
  });

  it('creates an undiscounted order and ignores untrusted client totals', async () => {
    const dto = {
      items: [{ productId: 1, size: 'S', quantity: 1, toppings: [] }],
      total: 1,
      subtotal: 1,
      discountAmount: 99_999,
    } as CreateOrderDto;

    const result = await service.create(7, dto);

    expect(result).toMatchObject({
      promotionCode: null,
      subtotal: 29_000,
      discountAmount: 0,
      total: 29_000,
    });
    expect(tx.promotion.findUnique).not.toHaveBeenCalled();
  });
});
