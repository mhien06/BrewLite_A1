import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AppModule } from '../src/app.module.js';
import {
  OrderStatus,
  PaymentMethod,
  PromotionType,
} from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Backend T10B - Idempotency & Ingredient Inventory (e2e)', () => {
  let app: INestApplication<App>;
  let tokenUser1: string;
  let tokenUser2: string;

  type UserRecord = {
    id: number;
    email: string;
    name: string;
    passwordHash: string;
    loyaltyPoints: number;
    createdAt: Date;
  };

  type IngredientRecord = {
    id: number;
    code: string;
    name: string;
    unit: string;
    stock: number;
    version: number;
  };

  type OrderItemRecord = {
    id: number;
    orderId: number;
    productId: number;
    size: string;
    toppings: string[];
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  };

  type OrderRecord = {
    id: number;
    userId: number;
    status: OrderStatus;
    paymentMethod: PaymentMethod | null;
    paidAt: Date | null;
    promotionCode: string | null;
    subtotal: number;
    discountAmount: number;
    total: number;
    inventoryDeducted: boolean;
    createdAt: Date;
    items: OrderItemRecord[];
  };

  type PaymentRecord = {
    id: number;
    userId: number;
    orderId: number;
    idempotencyKey: string;
    method: PaymentMethod;
    simulateSuccess: boolean;
    amount: number;
    status: OrderStatus;
    paidAt: Date | null;
    createdAt: Date;
  };

  let users: UserRecord[] = [];
  let ingredients: Map<number, IngredientRecord> = new Map();
  let orders: Map<number, OrderRecord> = new Map();
  let payments: Map<string, PaymentRecord> = new Map();
  let loyaltyOrderIds: Set<number> = new Set();
  let nextOrderId = 1;
  let nextPaymentId = 1;

  const products = [
    {
      id: 1,
      name: 'Cà phê sữa',
      price: 29_000,
      imageUrl: '/products/ca-phe-sua.jpg',
      stock: 50,
    },
    {
      id: 2,
      name: 'Bạc xỉu',
      price: 32_000,
      imageUrl: '/products/bac-xiu.jpg',
      stock: 40,
    },
  ];

  const getProductRecipes = (productIds: number[]) => {
    const allRecipes = [
      {
        id: 1,
        productId: 1,
        ingredientId: 1, // COFFEE_BEAN
        amountS: 20,
        amountM: 25,
        amountL: 30,
        isRequired: true,
        ingredient: ingredients.get(1)!,
      },
      {
        id: 2,
        productId: 1,
        ingredientId: 2, // CONDENSED_MILK
        amountS: 30,
        amountM: 40,
        amountL: 50,
        isRequired: true,
        ingredient: ingredients.get(2)!,
      },
      {
        id: 3,
        productId: 2,
        ingredientId: 1, // COFFEE_BEAN (shared with Product 1!)
        amountS: 15,
        amountM: 20,
        amountL: 25,
        isRequired: true,
        ingredient: ingredients.get(1)!,
      },
      {
        id: 4,
        productId: 2,
        ingredientId: 2, // CONDENSED_MILK (shared with Product 1!)
        amountS: 40,
        amountM: 50,
        amountL: 60,
        isRequired: true,
        ingredient: ingredients.get(2)!,
      },
    ];
    return allRecipes.filter((r) => productIds.includes(r.productId));
  };

  const getToppingRecipes = (toppingCodes: string[]) => {
    const allToppings = [
      {
        id: 1,
        toppingCode: 'pearls',
        ingredientId: 3, // PEARLS
        amount: 30,
        isRequired: true,
        ingredient: ingredients.get(3)!,
      },
    ];
    return allToppings.filter((t) => toppingCodes.includes(t.toppingCode));
  };

  // Transactional mock that snapshots state and rolls back on error
  const mockPrisma = {
    user: {
      findUnique: vi.fn().mockImplementation(({ where }) => {
        const found = users.find(
          (u) => u.id === where.id || u.email === where.email,
        );
        return Promise.resolve(found ? { ...found } : null);
      }),
      update: vi.fn().mockImplementation(({ where, data }) => {
        const found = users.find((u) => u.id === where.id);
        if (!found) throw new Error('User not found');
        found.loyaltyPoints += data.loyaltyPoints.increment;
        return Promise.resolve({ ...found });
      }),
    },
    product: {
      findMany: vi.fn().mockImplementation(({ where }) => {
        if (where?.id?.in) {
          return Promise.resolve(
            products.filter((p) => where.id.in.includes(p.id)),
          );
        }
        return Promise.resolve([...products]);
      }),
      findUnique: vi.fn().mockImplementation(({ where }) => {
        const found = products.find((p) => p.id === where.id);
        return Promise.resolve(found ? { ...found } : null);
      }),
    },
    productIngredient: {
      findMany: vi.fn().mockImplementation(({ where }) => {
        if (typeof where?.productId === 'number') {
          return Promise.resolve(getProductRecipes([where.productId]));
        }
        if (where?.productId?.in) {
          return Promise.resolve(getProductRecipes(where.productId.in));
        }
        return Promise.resolve([]);
      }),
    },
    toppingIngredient: {
      findMany: vi.fn().mockImplementation(({ where }) => {
        if (where?.toppingCode?.in) {
          return Promise.resolve(getToppingRecipes(where.toppingCode.in));
        }
        return Promise.resolve([]);
      }),
    },
    ingredient: {
      findUnique: vi.fn().mockImplementation(({ where }) => {
        const ing = ingredients.get(where.id);
        return Promise.resolve(ing ? { ...ing } : null);
      }),
      updateMany: vi.fn().mockImplementation(({ where, data }) => {
        const ing = ingredients.get(where.id);
        if (
          !ing ||
          ing.version !== where.version ||
          ing.stock < where.stock.gte
        ) {
          return Promise.resolve({ count: 0 });
        }
        ing.stock -= data.stock.decrement;
        ing.version += data.version.increment;
        return Promise.resolve({ count: 1 });
      }),
    },
    promotion: {
      findUnique: vi.fn().mockImplementation(({ where }) => {
        if (where.code === 'BREW10') {
          return Promise.resolve({
            id: 1,
            code: 'BREW10',
            type: PromotionType.PERCENT,
            value: 10,
            minOrderTotal: 50_000,
            maxDiscount: 20_000,
            startsAt: null,
            expiresAt: null,
            isActive: true,
            createdAt: new Date(),
          });
        }
        return Promise.resolve(null);
      }),
    },
    order: {
      create: vi.fn().mockImplementation(({ data }) => {
        const id = nextOrderId++;
        const createdAt = new Date();
        const items: OrderItemRecord[] = (data.items.create as Array<
          Omit<OrderItemRecord, 'id' | 'orderId'>
        >).map((item, idx) => ({
          id: idx + 1,
          orderId: id,
          ...item,
        }));
        const record: OrderRecord = {
          id,
          userId: data.userId,
          status: data.status,
          paymentMethod: null,
          paidAt: null,
          promotionCode: data.promotionCode ?? null,
          subtotal: data.subtotal,
          discountAmount: data.discountAmount,
          total: data.total,
          inventoryDeducted: false,
          createdAt,
          items,
        };
        orders.set(id, record);
        return Promise.resolve({ ...record });
      }),
      findFirst: vi.fn().mockImplementation(({ where }) => {
        const order = orders.get(where.id);
        if (!order || order.userId !== where.userId) {
          return Promise.resolve(null);
        }
        return Promise.resolve({ id: order.id, status: order.status });
      }),
      findUnique: vi.fn().mockImplementation(({ where }) => {
        const order = orders.get(where.id);
        return Promise.resolve(order ? { ...order } : null);
      }),
      updateMany: vi.fn().mockImplementation(({ where, data }) => {
        const order = orders.get(where.id);
        if (!order || order.status !== where.status) {
          return Promise.resolve({ count: 0 });
        }
        Object.assign(order, data);
        return Promise.resolve({ count: 1 });
      }),
      findUniqueOrThrow: vi.fn().mockImplementation(({ where }) => {
        const order = orders.get(where.id);
        if (!order) throw new Error('Order not found');
        return Promise.resolve({
          id: order.id,
          userId: order.userId,
          status: order.status,
          paymentMethod: order.paymentMethod,
          total: order.total,
          paidAt: order.paidAt,
          createdAt: order.createdAt,
        });
      }),
    },
    orderItem: {
      findMany: vi.fn().mockImplementation(({ where }) => {
        const order = orders.get(where.orderId);
        return Promise.resolve(order ? [...order.items] : []);
      }),
    },
    payment: {
      findUnique: vi.fn().mockImplementation(({ where }) => {
        const key = `${where.userId_idempotencyKey.userId}:${where.userId_idempotencyKey.idempotencyKey}`;
        const found = payments.get(key);
        if (!found) return Promise.resolve(null);
        const order = orders.get(found.orderId);
        return Promise.resolve({
          ...found,
          order: order ? { createdAt: order.createdAt } : undefined,
        });
      }),
      create: vi.fn().mockImplementation(({ data }) => {
        const key = `${data.userId}:${data.idempotencyKey}`;
        if (payments.has(key)) {
          throw new Error('Unique constraint failed on Payment');
        }
        const record: PaymentRecord = {
          id: nextPaymentId++,
          userId: data.userId,
          orderId: data.orderId,
          idempotencyKey: data.idempotencyKey,
          method: data.method,
          simulateSuccess: data.simulateSuccess,
          amount: data.amount,
          status: data.status,
          paidAt: data.paidAt,
          createdAt: new Date(),
        };
        payments.set(key, record);
        return Promise.resolve(record);
      }),
    },
    loyaltyTransaction: {
      createMany: vi.fn().mockImplementation(({ data }) => {
        const { orderId } = data[0] as { orderId: number };
        if (loyaltyOrderIds.has(orderId)) {
          return Promise.resolve({ count: 0 });
        }
        loyaltyOrderIds.add(orderId);
        return Promise.resolve({ count: 1 });
      }),
    },
    $transaction: vi.fn().mockImplementation(async (callback) => {
      // Snapshot state before running transaction so any thrown error rolls back cleanly
      const snapUsers = users.map((u) => ({ ...u }));
      const snapIngredients = new Map(
        [...ingredients.entries()].map(([k, v]) => [k, { ...v }]),
      );
      const snapOrders = new Map(
        [...orders.entries()].map(([k, v]) => [
          k,
          { ...v, items: v.items.map((i) => ({ ...i })) },
        ]),
      );
      const snapPayments = new Map(
        [...payments.entries()].map(([k, v]) => [k, { ...v }]),
      );
      const snapLoyalty = new Set(loyaltyOrderIds);

      try {
        return await callback(mockPrisma);
      } catch (err) {
        users = snapUsers;
        ingredients = snapIngredients;
        orders = snapOrders;
        payments = snapPayments;
        loyaltyOrderIds = snapLoyalty;
        throw err;
      }
    }),
  };

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('password123', 10);
    users = [
      {
        id: 1,
        email: 'user1@gmail.com',
        name: 'NGUYEN MINH HIEN',
        passwordHash,
        loyaltyPoints: 0,
        createdAt: new Date(),
      },
      {
        id: 2,
        email: 'user2@gmail.com',
        name: 'TRAN VAN B',
        passwordHash,
        loyaltyPoints: 0,
        createdAt: new Date(),
      },
    ];

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    const login1 = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'user1@gmail.com', password: 'password123' })
      .expect(200);
    tokenUser1 = login1.body.accessToken as string;

    const login2 = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'user2@gmail.com', password: 'password123' })
      .expect(200);
    tokenUser2 = login2.body.accessToken as string;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    users[0].loyaltyPoints = 0;
    users[1].loyaltyPoints = 0;
    orders.clear();
    payments.clear();
    loyaltyOrderIds.clear();
    nextOrderId = 1;
    nextPaymentId = 1;
    ingredients = new Map([
      [
        1,
        {
          id: 1,
          code: 'COFFEE_BEAN',
          name: 'Hạt cà phê',
          unit: 'g',
          stock: 100, // 5 cups of Cà phê sữa S (20g each)
          version: 1,
        },
      ],
      [
        2,
        {
          id: 2,
          code: 'CONDENSED_MILK',
          name: 'Sữa đặc',
          unit: 'ml',
          stock: 300,
          version: 1,
        },
      ],
      [
        3,
        {
          id: 3,
          code: 'PEARLS',
          name: 'Trân châu đường đen',
          unit: 'g',
          stock: 60, // 2 portions of pearls (30g each)
          version: 1,
        },
      ],
    ]);
  });

  it('computes dynamic product stock from ingredient recipes in GET /products', async () => {
    // COFFEE_BEAN = 100g -> Product 1 (20g) = 5 cups; Product 2 (15g) = 6 cups
    // CONDENSED_MILK = 300ml -> Product 1 (30ml) = 10 cups; Product 2 (40ml) = 7 cups
    const response = await request(app.getHttpServer())
      .get('/products')
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({ id: 1, name: 'Cà phê sữa', stock: 5 }),
      expect.objectContaining({ id: 2, name: 'Bạc xỉu', stock: 6 }),
    ]);
  });

  it('(b) handles sequential and concurrent duplicate Idempotency-Key without double deduction or double loyalty points', async () => {
    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${tokenUser1}`)
      .send({
        items: [{ productId: 1, size: 'S', quantity: 2, toppings: ['pearls'] }],
      })
      .expect(201);

    const orderId = orderRes.body.id as number;
    const payload = {
      orderId,
      method: PaymentMethod.WALLET,
      simulateSuccess: true,
    };

    // Fire 3 concurrent requests with the exact same Idempotency-Key
    const [res1, res2, res3] = await Promise.all([
      request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${tokenUser1}`)
        .set('Idempotency-Key', 'idem-concurrent-001')
        .send(payload),
      request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${tokenUser1}`)
        .set('Idempotency-Key', 'idem-concurrent-001')
        .send(payload),
      request(app.getHttpServer())
        .post('/payments')
        .set('Authorization', `Bearer ${tokenUser1}`)
        .set('Idempotency-Key', 'idem-concurrent-001')
        .send(payload),
    ]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res3.status).toBe(200);
    expect(res1.body).toEqual(res2.body);
    expect(res2.body).toEqual(res3.body);
    expect(res1.body.status).toBe(OrderStatus.PAID);

    // Only 1 Payment record created, stock deducted ONCE (100 - 40 = 60g coffee, 60 - 60 = 0g pearls)
    expect(payments.size).toBe(1);
    expect(ingredients.get(1)!.stock).toBe(60);
    expect(ingredients.get(3)!.stock).toBe(0);
    expect(users[0].loyaltyPoints).toBe(Math.floor(orderRes.body.total / 10_000));
  });

  it('(b) rejects same Idempotency-Key with different payload (409) and isolates keys between accounts', async () => {
    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${tokenUser1}`)
      .send({
        items: [{ productId: 1, size: 'S', quantity: 1, toppings: [] }],
      })
      .expect(201);

    const orderId = orderRes.body.id as number;

    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${tokenUser1}`)
      .set('Idempotency-Key', 'key-user1-alpha')
      .send({
        orderId,
        method: PaymentMethod.WALLET,
        simulateSuccess: true,
      })
      .expect(200);

    // Same user, same key, different method -> 409 Conflict
    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${tokenUser1}`)
      .set('Idempotency-Key', 'key-user1-alpha')
      .send({
        orderId,
        method: PaymentMethod.CARD,
        simulateSuccess: true,
      })
      .expect(409);

    // Different user trying to replay User 1's key on User 1's order -> 404 NotFound (no data leak!)
    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${tokenUser2}`)
      .set('Idempotency-Key', 'key-user1-alpha')
      .send({
        orderId,
        method: PaymentMethod.WALLET,
        simulateSuccess: true,
      })
      .expect(404);
  });

  it('allows retry on PAYMENT_FAILED with a new key while replaying the failed key returns PAYMENT_FAILED', async () => {
    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${tokenUser1}`)
      .send({
        items: [{ productId: 1, size: 'S', quantity: 1, toppings: [] }],
      })
      .expect(201);

    const orderId = orderRes.body.id as number;

    const failedRes = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${tokenUser1}`)
      .set('Idempotency-Key', 'key-attempt-1-fail')
      .send({
        orderId,
        method: PaymentMethod.WALLET,
        simulateSuccess: false,
      })
      .expect(200);

    expect(failedRes.body.status).toBe(OrderStatus.PAYMENT_FAILED);
    // Failed payment must NOT deduct stock or award points
    expect(ingredients.get(1)!.stock).toBe(100);
    expect(users[0].loyaltyPoints).toBe(0);

    // Retry with a new key succeeds -> PAID
    const paidRes = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${tokenUser1}`)
      .set('Idempotency-Key', 'key-attempt-2-ok')
      .send({
        orderId,
        method: PaymentMethod.CARD,
        simulateSuccess: true,
      })
      .expect(200);

    expect(paidRes.body.status).toBe(OrderStatus.PAID);
    expect(ingredients.get(1)!.stock).toBe(80);

    // Replaying the first failed key with its original payload still returns its saved PAYMENT_FAILED snapshot
    const replayFail = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${tokenUser1}`)
      .set('Idempotency-Key', 'key-attempt-1-fail')
      .send({
        orderId,
        method: PaymentMethod.WALLET,
        simulateSuccess: false,
      })
      .expect(200);

    expect(replayFail.body.status).toBe(OrderStatus.PAYMENT_FAILED);
  });

  it('(c) prevents overselling when multiple concurrent orders compete for shared ingredients and rolls back on insufficient stock', async () => {
    // Set COFFEE_BEAN stock to 40g -> enough for ONLY 2 orders of 1 cup Cà phê sữa S (20g each)
    ingredients.get(1)!.stock = 40;

    // Create 4 separate PENDING orders (each needs 20g COFFEE_BEAN + 30ml CONDENSED_MILK)
    const createdOrderIds: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${tokenUser1}`)
        .send({
          items: [{ productId: 1, size: 'S', quantity: 1, toppings: [] }],
        })
        .expect(201);
      createdOrderIds.push(res.body.id as number);
    }

    // Pay all 4 orders simultaneously
    const paymentResponses = await Promise.all(
      createdOrderIds.map((orderId, idx) =>
        request(app.getHttpServer())
          .post('/payments')
          .set('Authorization', `Bearer ${tokenUser1}`)
          .set('Idempotency-Key', `concurrent-order-pay-${idx}`)
          .send({
            orderId,
            method: PaymentMethod.WALLET,
            simulateSuccess: true,
          }),
      ),
    );

    const succeeded = paymentResponses.filter((r) => r.status === 200);
    const conflicts = paymentResponses.filter((r) => r.status === 409);

    // Exactly 2 orders succeed (consuming 2 * 20g = 40g), and 2 orders fail with 409 Conflict!
    expect(succeeded).toHaveLength(2);
    expect(conflicts).toHaveLength(2);

    // COFFEE_BEAN stock is 0 (never negative!), CONDENSED_MILK only deducted for the 2 paid orders (300 - 60 = 240ml)
    expect(ingredients.get(1)!.stock).toBe(0);
    expect(ingredients.get(2)!.stock).toBe(240);

    // Failed orders remain PENDING (not PAID) and did not receive loyalty points
    const paidOrdersInDb = [...orders.values()].filter(
      (o) => o.status === OrderStatus.PAID,
    );
    const pendingOrdersInDb = [...orders.values()].filter(
      (o) => o.status === OrderStatus.PENDING,
    );
    expect(paidOrdersInDb).toHaveLength(2);
    expect(pendingOrdersInDb).toHaveLength(2);
  });

  afterAll(async () => {
    await app.close();
  });
});
