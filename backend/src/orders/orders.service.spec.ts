import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrdersService } from './orders.service.js';

describe('OrdersService - History and Detail (T09A)', () => {
  const prisma = {
    order: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  let service: OrdersService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OrdersService(prisma as unknown as PrismaService);
  });

  describe('findMyOrders', () => {
    it('returns empty array when user has no orders', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      const result = await service.findMyOrders(1);

      expect(result).toEqual([]);
      expect(prisma.order.findMany).toHaveBeenCalledWith({
        where: { userId: 1 },
        orderBy: { createdAt: 'desc' },
        select: expect.objectContaining({
          id: true,
          status: true,
          total: true,
          items: expect.any(Object),
        }),
      });
    });

    it('returns orders belonging to current user', async () => {
      const mockOrders = [
        {
          id: 101,
          userId: 1,
          status: 'PAID',
          paymentMethod: 'WALLET',
          paidAt: new Date(),
          total: 45000,
          createdAt: new Date(),
          items: [
            {
              id: 1,
              productId: 2,
              size: 'M',
              toppings: ['pearls'],
              quantity: 1,
              unitPrice: 45000,
              lineTotal: 45000,
              product: {
                id: 2,
                name: 'Cà phê sữa',
                imageUrl: '/products/ca-phe-sua.jpg',
              },
            },
          ],
        },
      ];
      prisma.order.findMany.mockResolvedValue(mockOrders);

      const result = await service.findMyOrders(1);

      expect(result).toEqual(mockOrders);
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 1 } }),
      );
    });
  });

  describe('findOne', () => {
    it('throws BadRequestException for invalid order id', async () => {
      await expect(service.findOne(1, 0)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.findOne(1, -5)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.order.findFirst).not.toHaveBeenCalled();
    });

    it('returns order details when order belongs to current user', async () => {
      const mockOrder = {
        id: 101,
        userId: 1,
        status: 'PAID',
        paymentMethod: 'WALLET',
        paidAt: new Date(),
        total: 45000,
        createdAt: new Date(),
        items: [],
      };
      prisma.order.findFirst.mockResolvedValue(mockOrder);

      const result = await service.findOne(1, 101);

      expect(result).toEqual(mockOrder);
      expect(prisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 101, userId: 1 },
        }),
      );
    });

    it('throws NotFoundException when order does not belong to user (preventing IDOR)', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(service.findOne(2, 101)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 101, userId: 2 },
        }),
      );
    });
  });
});
