import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { InventoryService } from './inventory.service.js';

describe('InventoryService', () => {
  const mockTx = {
    productIngredient: {
      findMany: vi.fn(),
    },
    toppingIngredient: {
      findMany: vi.fn(),
    },
    ingredient: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    orderItem: {
      findMany: vi.fn(),
    },
  };

  let service: InventoryService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new InventoryService(mockTx as unknown as PrismaService);
  });

  describe('calculateAvailableUnitsFromQuotas', () => {
    it('computes min(floor(stock / requiredAmount)) across required ingredients', () => {
      const units = service.calculateAvailableUnitsFromQuotas([
        {
          ingredientId: 1,
          code: 'COFFEE_BEAN',
          name: 'Hạt cà phê',
          unit: 'g',
          stock: 105,
          version: 1,
          amountPerUnit: 20, // floor(105 / 20) = 5
          isRequired: true,
        },
        {
          ingredientId: 2,
          code: 'CONDENSED_MILK',
          name: 'Sữa đặc',
          unit: 'ml',
          stock: 110,
          version: 1,
          amountPerUnit: 30, // floor(110 / 30) = 3
          isRequired: true,
        },
      ]);

      expect(units).toBe(3);
    });

    it('returns 0 in display mode and throws in strict mode when recipe is missing or invalid', () => {
      expect(service.calculateAvailableUnitsFromQuotas([])).toBe(0);
      expect(() =>
        service.calculateAvailableUnitsFromQuotas([], { strict: true }),
      ).toThrow(BadRequestException);

      expect(
        service.calculateAvailableUnitsFromQuotas([
          {
            ingredientId: 1,
            code: 'COFFEE_BEAN',
            name: 'Hạt cà phê',
            unit: 'g',
            stock: 100,
            version: 1,
            amountPerUnit: 0,
            isRequired: true,
          },
        ]),
      ).toBe(0);

      expect(() =>
        service.calculateAvailableUnitsFromQuotas(
          [
            {
              ingredientId: 1,
              code: 'COFFEE_BEAN',
              name: 'Hạt cà phê',
              unit: 'g',
              stock: 100,
              version: 1,
              amountPerUnit: -5,
              isRequired: true,
            },
          ],
          { strict: true },
        ),
      ).toThrow(BadRequestException);
    });
  });

  describe('aggregateOrderIngredientDemands & assertCartStockAvailable', () => {
    const coffeeBean = {
      id: 1,
      code: 'COFFEE_BEAN',
      name: 'Hạt cà phê',
      unit: 'g',
      stock: 60,
      version: 1,
    };
    const condensedMilk = {
      id: 2,
      code: 'CONDENSED_MILK',
      name: 'Sữa đặc',
      unit: 'ml',
      stock: 200,
      version: 1,
    };
    const pearls = {
      id: 3,
      code: 'PEARLS',
      name: 'Trân châu',
      unit: 'g',
      stock: 100,
      version: 1,
    };

    beforeEach(() => {
      mockTx.productIngredient.findMany.mockResolvedValue([
        {
          productId: 1,
          ingredientId: 1,
          amountS: 20,
          amountM: 25,
          amountL: 30,
          isRequired: true,
          ingredient: coffeeBean,
        },
        {
          productId: 1,
          ingredientId: 2,
          amountS: 30,
          amountM: 40,
          amountL: 50,
          isRequired: true,
          ingredient: condensedMilk,
        },
        {
          productId: 2,
          ingredientId: 1,
          amountS: 15,
          amountM: 20,
          amountL: 25,
          isRequired: true,
          ingredient: coffeeBean,
        },
        {
          productId: 2,
          ingredientId: 2,
          amountS: 40,
          amountM: 50,
          amountL: 60,
          isRequired: true,
          ingredient: condensedMilk,
        },
      ]);
      mockTx.toppingIngredient.findMany.mockResolvedValue([
        {
          toppingCode: 'pearls',
          ingredientId: 3,
          amount: 30,
          isRequired: true,
          ingredient: pearls,
        },
      ]);
    });

    it('aggregates shared ingredients and toppings across multiple products in the cart', async () => {
      const demands = await service.aggregateOrderIngredientDemands(
        mockTx as never,
        [
          { productId: 1, size: 'M', quantity: 1, toppings: ['pearls'] }, // 25g coffee, 40ml milk, 30g pearls
          { productId: 2, size: 'L', quantity: 1, toppings: ['pearls'] }, // 25g coffee, 60ml milk, 30g pearls
        ],
      );

      expect(demands).toEqual([
        expect.objectContaining({
          ingredientId: 1,
          code: 'COFFEE_BEAN',
          requiredAmount: 50,
        }),
        expect.objectContaining({
          ingredientId: 2,
          code: 'CONDENSED_MILK',
          requiredAmount: 100,
        }),
        expect.objectContaining({
          ingredientId: 3,
          code: 'PEARLS',
          requiredAmount: 60,
        }),
      ]);
    });

    it('rejects cart when combined shared ingredient demand exceeds stock even if each item alone fits', async () => {
      // Coffee bean stock is 60g.
      // Item 1 alone needs 2 * 20g = 40g (<= 60g).
      // Item 2 alone needs 2 * 15g = 30g (<= 60g).
      // Combined needs 70g (> 60g) -> must fail!
      await expect(
        service.assertCartStockAvailable(mockTx as never, [
          { productId: 1, size: 'S', quantity: 2, toppings: [] },
          { productId: 2, size: 'S', quantity: 2, toppings: [] },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('deductForPaidOrder with optimistic locking', () => {
    it('retries when version advances concurrently while stock remains sufficient', async () => {
      const coffeeBean = {
        id: 1,
        code: 'COFFEE_BEAN',
        name: 'Hạt cà phê',
        unit: 'g',
        stock: 100,
        version: 1,
      };
      mockTx.productIngredient.findMany.mockResolvedValue([
        {
          productId: 1,
          ingredientId: 1,
          amountS: 20,
          amountM: 25,
          amountL: 30,
          isRequired: true,
          ingredient: coffeeBean,
        },
      ]);
      mockTx.toppingIngredient.findMany.mockResolvedValue([]);
      mockTx.ingredient.updateMany
        .mockResolvedValueOnce({ count: 0 }) // Version 1 collided
        .mockResolvedValueOnce({ count: 1 }); // Version 2 succeeded
      mockTx.ingredient.findUnique.mockResolvedValue({
        id: 1,
        stock: 80,
        version: 2,
      });

      await service.deductForPaidOrder(mockTx as never, 10, [
        { productId: 1, size: 'S', quantity: 1, toppings: [] },
      ]);

      expect(mockTx.ingredient.updateMany).toHaveBeenCalledTimes(2);
      expect(mockTx.ingredient.updateMany).toHaveBeenNthCalledWith(1, {
        where: { id: 1, version: 1, stock: { gte: 20 } },
        data: { stock: { decrement: 20 }, version: { increment: 1 } },
      });
      expect(mockTx.ingredient.updateMany).toHaveBeenNthCalledWith(2, {
        where: { id: 1, version: 2, stock: { gte: 20 } },
        data: { stock: { decrement: 20 }, version: { increment: 1 } },
      });
    });

    it('throws ConflictException when stock is depleted during concurrent update', async () => {
      const coffeeBean = {
        id: 1,
        code: 'COFFEE_BEAN',
        name: 'Hạt cà phê',
        unit: 'g',
        stock: 20,
        version: 1,
      };
      mockTx.productIngredient.findMany.mockResolvedValue([
        {
          productId: 1,
          ingredientId: 1,
          amountS: 20,
          amountM: 25,
          amountL: 30,
          isRequired: true,
          ingredient: coffeeBean,
        },
      ]);
      mockTx.toppingIngredient.findMany.mockResolvedValue([]);
      mockTx.ingredient.updateMany.mockResolvedValue({ count: 0 });
      mockTx.ingredient.findUnique.mockResolvedValue({
        id: 1,
        stock: 0,
        version: 2,
      });

      await expect(
        service.deductForPaidOrder(mockTx as never, 10, [
          { productId: 1, size: 'S', quantity: 1, toppings: [] },
        ]),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
