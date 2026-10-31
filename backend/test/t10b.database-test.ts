import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { InventoryService } from '../src/inventory/inventory.service.js';
import { OrderStateService } from '../src/orders/order-state.service.js';
import { LoyaltyService } from '../src/loyalty/loyalty.service.js';
import { PaymentMethod } from '../src/generated/prisma/client.js';

// Hai service dùng hai kết nối DB: Map trong bộ nhớ không thể bảo vệ thay PostgreSQL.
describe('T10B với PostgreSQL thật', () => {
  const db = new PrismaService();
  const secondDb = new PrismaService();
  const loyalty = new LoyaltyService();
  const makeService = (client: PrismaService) =>
    new PaymentsService(
      client,
      new OrderStateService(client),
      loyalty,
      new InventoryService(client),
    );
  const services = [makeService(db), makeService(secondDb)];
  const createdUsers: number[] = [];
  const createdProducts: number[] = [];
  const createdIngredients: number[] = [];
  let userId: number;
  let productId: number;
  let ingredientId: number;

  beforeAll(async () => {
    await db.$connect();
    await secondDb.$connect();
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    const tag = crypto.randomUUID();
    const user = await db.user.create({
      data: { email: `${tag}@test.local`, passwordHash: 'unused-test-hash' },
    });
    const product = await db.product.create({
      data: {
        name: `Test ${tag}`,
        price: 30000,
        imageUrl: '/test.png',
        stock: 999,
      },
    });
    const ingredient = await db.ingredient.create({
      data: { code: tag, name: 'Cà phê thử', unit: 'g', stock: 100 },
    });
    userId = user.id;
    productId = product.id;
    ingredientId = ingredient.id;
    createdUsers.push(userId);
    createdProducts.push(productId);
    createdIngredients.push(ingredientId);
    await db.productIngredient.create({
      data: { productId, ingredientId, amountS: 20, amountM: 25, amountL: 30 },
    });
  });
  const createOrder = () =>
    db.order.create({
      data: {
        userId,
        total: 30000,
        subtotal: 30000,
        items: {
          create: {
            productId,
            size: 'S',
            quantity: 1,
            unitPrice: 30000,
            lineTotal: 30000,
          },
        },
      },
    });
  const pay = (
    orderId: number,
    key: string,
    server = 0,
    simulateSuccess = true,
  ) =>
    services[server].create(
      userId,
      { orderId, method: PaymentMethod.WALLET, simulateSuccess },
      key,
    );
  const stock = async () =>
    (await db.ingredient.findUniqueOrThrow({ where: { id: ingredientId } }))
      .stock;

  it('cùng khóa đồng thời qua hai service chỉ trừ kho và cộng điểm một lần', async () => {
    const order = await createOrder();
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => pay(order.id, 'same-key', i % 2)),
    );
    expect(results.every((r) => r.status === 'PAID' && r.id === order.id)).toBe(
      true,
    );
    expect(await stock()).toBe(80);
    expect(await db.payment.count({ where: { orderId: order.id } })).toBe(1);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: userId } }))
        .loyaltyPoints,
    ).toBe(3);
    // Service mới vẫn replay được nhờ kết quả lưu trong database.
    expect(
      (
        await makeService(secondDb).create(
          userId,
          {
            orderId: order.id,
            method: PaymentMethod.WALLET,
            simulateSuccess: true,
          },
          'same-key',
        )
      ).status,
    ).toBe('PAID');
    await expect(pay(order.id, 'new-key')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  it('cùng khóa khác nội dung bị từ chối, không ghi thêm payment', async () => {
    const order = await createOrder();
    await pay(order.id, 'payload-key');
    await expect(pay(order.id, 'payload-key', 1, false)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(await stock()).toBe(80);
    expect(await db.payment.count({ where: { orderId: order.id } })).toBe(1);
  });
  it('thất bại giữ kho; khóa mới thử lại cùng đơn được thanh toán', async () => {
    const order = await createOrder();
    expect((await pay(order.id, 'failed-key', 0, false)).status).toBe(
      'PAYMENT_FAILED',
    );
    expect(await stock()).toBe(100);
    await pay(order.id, 'retry-key', 1);
    expect(await stock()).toBe(80);
    expect((await pay(order.id, 'failed-key', 0, false)).status).toBe(
      'PAYMENT_FAILED',
    );
    expect(await stock()).toBe(80);
  });
  it('hai khóa khác nhau trả cho cùng một đơn không trừ kho lần hai', async () => {
    const order = await createOrder();
    const results = await Promise.allSettled([
      pay(order.id, 'key-a'),
      pay(order.id, 'key-b', 1),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await stock()).toBe(80);
    expect(await db.payment.count({ where: { orderId: order.id } })).toBe(1);
  });
  it('nhiều đơn dùng chung nguyên liệu không bán vượt kho', async () => {
    await db.ingredient.update({
      where: { id: ingredientId },
      data: { stock: 40 },
    });
    const orders = await Promise.all(Array.from({ length: 5 }, createOrder));
    const results = await Promise.allSettled(
      orders.map((o, i) => pay(o.id, `stock-${i}`, i % 2)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    for (const result of results)
      if (result.status === 'rejected')
        expect(result.reason).toBeInstanceOf(ConflictException);
    expect(await stock()).toBe(0);
    expect(await db.payment.count({ where: { userId } })).toBe(2);
  });
  it('cộng chung nguyên liệu của nhiều món, size và topping trước khi trừ', async () => {
    const toppingCode = `test-${crypto.randomUUID()}`;
    await db.toppingIngredient.create({
      data: { toppingCode, ingredientId, amount: 5 },
    });
    const otherProduct = await db.product.create({
      data: {
        name: toppingCode,
        price: 30000,
        imageUrl: '/test.png',
        stock: 999,
      },
    });
    createdProducts.push(otherProduct.id);
    await db.productIngredient.create({
      data: {
        productId: otherProduct.id,
        ingredientId,
        amountS: 20,
        amountM: 25,
        amountL: 30,
      },
    });
    const order = await db.order.create({
      data: {
        userId,
        total: 90000,
        subtotal: 90000,
        items: {
          create: [
            {
              productId,
              size: 'M',
              quantity: 1,
              toppings: [toppingCode],
              unitPrice: 30000,
              lineTotal: 30000,
            },
            {
              productId: otherProduct.id,
              size: 'S',
              quantity: 2,
              unitPrice: 30000,
              lineTotal: 60000,
            },
          ],
        },
      },
    });
    await pay(order.id, 'shared-recipe-key');
    // M: 25g + topping 5g; món còn lại: 2 x 20g. Tổng cộng 70g.
    expect(await stock()).toBe(30);
  });
  it('lỗi sau trừ nguyên liệu rollback cả kho, trạng thái, điểm và payment', async () => {
    const order = await createOrder();
    vi.spyOn(loyalty, 'awardPointsForPaidOrder').mockRejectedValueOnce(
      new Error('Lỗi thử rollback'),
    );
    await expect(pay(order.id, 'rollback-key')).rejects.toThrow(
      'Lỗi thử rollback',
    );
    expect(await stock()).toBe(100);
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
    ).toBe('PENDING');
    expect(await db.payment.count({ where: { orderId: order.id } })).toBe(0);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: userId } }))
        .loyaltyPoints,
    ).toBe(0);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    // Chỉ xóa các bản ghi do bài test này tạo, không reset database.
    await db.payment.deleteMany({ where: { userId: { in: createdUsers } } });
    await db.loyaltyTransaction.deleteMany({
      where: { userId: { in: createdUsers } },
    });
    await db.order.deleteMany({ where: { userId: { in: createdUsers } } });
    await db.product.deleteMany({ where: { id: { in: createdProducts } } });
    await db.toppingIngredient.deleteMany({
      where: { ingredientId: { in: createdIngredients } },
    });
    await db.ingredient.deleteMany({
      where: { id: { in: createdIngredients } },
    });
    await db.user.deleteMany({ where: { id: { in: createdUsers } } });
    await db.$disconnect();
    await secondDb.$disconnect();
  });
});
