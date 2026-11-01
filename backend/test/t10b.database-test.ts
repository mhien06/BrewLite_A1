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
import { OrdersService } from '../src/orders/orders.service.js';
import { PromotionsService } from '../src/promotions/promotions.service.js';
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

  it('hai phần topping tính đủ giá, trừ đủ kho và hủy hoàn đúng', async () => {
    await db.toppingIngredient.create({ data: { toppingCode: 'jelly', ingredientId, amount: 5 } });
    const orders = new OrdersService(db, new PromotionsService(db), new InventoryService(db));
    const order = await orders.create(userId, { items: [{ productId, size: 'S', quantity: 2, toppings: ['jelly', 'jelly'] }] });
    expect(order.total).toBe(88000);
    expect(order.items[0].toppings).toEqual(['jelly', 'jelly']);
    await pay(order.id, 'double-topping');
    expect(await stock()).toBe(40); // 2 ly x (20g + 2 phần x 5g).
    await new OrderStateService(db).transition(order.id, 'CANCELLED');
    expect(await stock()).toBe(100);
  });
  it('hủy PAID hoàn đúng snapshot, thu hồi điểm và không hoàn lặp', async () => {
    const order = await createOrder();
    await pay(order.id, 'cancel-paid');
    await db.productIngredient.updateMany({
      where: { productId },
      data: { amountS: 80 },
    });
    const states = new OrderStateService(db);
    await states.transition(order.id, 'CANCELLED');
    await states.transition(order.id, 'CANCELLED');
    expect(await stock()).toBe(100);
    const cancelled = await db.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.inventoryDeducted).toBe(false);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: userId } }))
        .loyaltyPoints,
    ).toBe(0);
    expect(
      (
        await db.loyaltyTransaction.findUniqueOrThrow({
          where: { orderId: order.id },
        })
      ).reversed,
    ).toBe(true);
    expect(
      await db.inventoryMovement.count({ where: { actorId: userId } }),
    ).toBe(1);
    // Replay thanh toán vẫn trả kết quả gốc, không làm đơn sống lại.
    await pay(order.id, 'cancel-paid');
    expect(await stock()).toBe(100);
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
    ).toBe('CANCELLED');
  });
  it('hai kết nối cùng hủy chỉ hoàn một lần', async () => {
    const order = await createOrder();
    await pay(order.id, 'cancel-concurrent');
    await Promise.all([
      new OrderStateService(db).transition(order.id, 'CANCELLED'),
      new OrderStateService(secondDb).transition(order.id, 'CANCELLED'),
    ]);
    expect(await stock()).toBe(100);
    expect(
      await db.inventoryMovement.count({ where: { actorId: userId } }),
    ).toBe(1);
  });
  it('hủy tranh với nhận pha chỉ một trạng thái thắng', async () => {
    const order = await createOrder();
    await pay(order.id, 'cancel-race');
    const results = await Promise.allSettled([
      new OrderStateService(db).transition(order.id, 'CANCELLED'),
      new OrderStateService(secondDb).transition(order.id, 'PREPARING'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const current = await db.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(await stock()).toBe(current.status === 'CANCELLED' ? 100 : 80);
    await expect(
      new OrderStateService(db).transition(
        order.id,
        current.status === 'CANCELLED' ? 'PREPARING' : 'CANCELLED',
      ),
    ).rejects.toThrow(ConflictException);
  });
  it('lỗi sau hoàn kho rollback toàn bộ', async () => {
    const order = await createOrder();
    await pay(order.id, 'cancel-rollback');
    await expect(
      db.$transaction(async (tx) => {
        await new OrderStateService(db).transition(order.id, 'CANCELLED', tx);
        throw new Error('cancel rollback');
      }),
    ).rejects.toThrow('cancel rollback');
    expect(await stock()).toBe(80);
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status,
    ).toBe('PAID');
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: userId } }))
        .loyaltyPoints,
    ).toBe(3);
    expect(
      await db.inventoryMovement.count({ where: { actorId: userId } }),
    ).toBe(0);
  });
  it('đơn cũ thiếu snapshot bị chặn, không tự đoán lượng hoàn', async () => {
    const order = await createOrder();
    await pay(order.id, 'cancel-legacy');
    await db.$executeRaw`UPDATE "Order" SET "inventorySnapshot" = NULL WHERE id = ${order.id}`;
    await expect(
      new OrderStateService(db).transition(order.id, 'CANCELLED'),
    ).rejects.toThrow('Đơn cũ');
    expect(await stock()).toBe(80);
  });
  it('thử thanh toán lỗi nhiều lần đi qua PENDING rồi thanh toán thành công', async () => {
    const order = await createOrder();
    await pay(order.id, 'retry-fail-1', 0, false);
    await pay(order.id, 'retry-fail-2', 0, false);
    expect(await stock()).toBe(100);
    await pay(order.id, 'retry-ok');
    expect(await stock()).toBe(80);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    // Chỉ xóa các bản ghi do bài test này tạo, không reset database.
    await db.inventoryMovement.deleteMany({
      where: { actorId: { in: createdUsers } },
    });
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
