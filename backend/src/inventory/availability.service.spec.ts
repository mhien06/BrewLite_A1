import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AvailabilityService } from './availability.service.js';
import { InventoryService } from './inventory.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const coffee = { id: 1, stock: 100 };
const cream = { id: 2, stock: 40 };
const makeProduct = (id: number) => ({
  id,
  name: `Cà phê ${id}`,
  recipes: [
    {
      ingredientId: 1,
      amountS: 10,
      amountM: 25,
      amountL: 50,
      ingredient: coffee,
    },
  ],
});

describe('Khả năng đáp ứng size/topping và cả giỏ', () => {
  let service: AvailabilityService;
  beforeEach(() => {
    coffee.stock = 100;
    cream.stock = 40;
    const tx = {
      product: {
        findMany: vi.fn().mockResolvedValue([makeProduct(1), makeProduct(2)]),
      },
      toppingIngredient: {
        findMany: vi.fn().mockResolvedValue([
          {
            toppingCode: 'cream',
            ingredientId: 2,
            amount: 40,
            ingredient: cream,
          },
        ]),
      },
    };
    const prisma = {
      $transaction: (fn: (db: typeof tx) => unknown) => fn(tx),
    } as unknown as PrismaService;
    service = new AvailabilityService(prisma, new InventoryService(prisma));
  });
  const item = (
    size: 'S' | 'M' | 'L' = 'M',
    quantity = 1,
    toppings: string[] = [],
  ) => ({ productId: 1, size, quantity, toppings });
  it('khác size thì khác số lượng tối đa', async () => {
    for (const [size, maximum] of [
      ['S', 10],
      ['M', 4],
      ['L', 2],
    ] as const) {
      const result = await service.checkCart({ items: [item(size)] });
      expect(result.items[0].maxQuantity).toBe(maximum);
    }
  });
  it('kem chỉ đủ 1 ly dù món chính còn nhiều', async () => {
    const result = await service.checkCart({
      items: [item('M', 2, ['cream'])],
    });
    expect(result.available).toBe(false);
    expect(result.items[0].maxQuantity).toBe(1);
    expect(result.items[0].message).toContain('Kem sữa');
    expect(JSON.stringify(result)).not.toContain('40ml');
  });
  it('hết topping không làm hết món không topping', async () => {
    cream.stock = 0;
    const result = await service.checkCart({ items: [item()] });
    expect(result.available).toBe(true);
    expect(
      result.items[0].toppings.find((t) => t.code === 'cream')?.stockQuantity,
    ).toBe(0);
  });
  it('cộng nguyên liệu dùng chung giữa nhiều món', async () => {
    const result = await service.checkCart({
      items: [item('M', 3), { ...item('L'), productId: 2 }],
    });
    expect(result.available).toBe(false);
    expect(result.items[0].maxQuantity).toBe(2);
    expect(result.items[1].maxQuantity).toBe(0);
  });
  it('topping được dùng ở dòng khác cũng phải trừ khỏi khả năng còn lại', async () => {
    const result = await service.checkCart({
      items: [item('S', 1, ['cream']), { ...item('S'), productId: 2 }],
    });
    expect(result.available).toBe(true);
    expect(
      result.items[1].toppings.find((t) => t.code === 'cream')?.stockQuantity,
    ).toBe(0);
  });
  it('đổi bỏ topping hết cho phép mua lại món chính', async () => {
    cream.stock = 0;
    expect(
      (await service.checkCart({ items: [item('M', 1, ['cream'])] })).available,
    ).toBe(false);
    expect((await service.checkCart({ items: [item()] })).available).toBe(true);
  });
  it('hai phần kem mỗi ly phải dùng gấp đôi kho', async () => {
    cream.stock = 80;
    const result = await service.checkCart({
      items: [item('M', 1, ['cream', 'cream'])],
    });
    expect(result.available).toBe(true);
    expect(result.items[0].maxQuantity).toBe(1);
    expect(
      (await service.checkCart({ items: [item('M', 2, ['cream', 'cream'])] }))
        .available,
    ).toBe(false);
  });
  it('giỏ trống hợp lệ, không tạo nhu cầu kho', async () => {
    expect(await service.checkCart({ items: [] })).toEqual({
      available: true,
      items: [],
    });
  });
  it('không đổi lượng tồn khi kiểm tra', async () => {
    await service.checkCart({ items: [item('S', 2, ['cream'])] });
    expect(coffee.stock).toBe(100);
    expect(cream.stock).toBe(40);
  });
});
