import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OrderStatus,
  PaymentMethod,
  PromotionType,
} from '../src/generated/prisma/client.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Backend T10A (e2e)', () => {
  let app: INestApplication<App>;
  let token: string;

  const mockUser = {
    id: 1,
    email: 't10a@gmail.com',
    name: 'BREWLITE TEST',
    passwordHash: '',
    loyaltyPoints: 0,
    createdAt: new Date(),
  };
  const promo = {
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
  };
  const awardedOrders = new Set<number>();
  let mockOrder = {
    id: 100,
    userId: mockUser.id,
    status: OrderStatus.PENDING,
    paymentMethod: null as PaymentMethod | null,
    paidAt: null as Date | null,
    subtotal: 58_000,
    discountAmount: 0,
    promotionCode: null as string | null,
    total: 58_000,
    createdAt: new Date(),
  };

  const mockPrisma = {
    user: {
      findUnique: vi.fn().mockImplementation(({ where }) => {
        if (where.id === mockUser.id || where.email === mockUser.email) {
          return Promise.resolve(mockUser);
        }
        return Promise.resolve(null);
      }),
      update: vi.fn().mockImplementation(({ data }) => {
        mockUser.loyaltyPoints += data.loyaltyPoints.increment;
        return Promise.resolve(mockUser);
      }),
    },
    product: {
      findMany: vi.fn().mockResolvedValue([
        { id: 1, name: 'Cà phê sữa', price: 29_000, stock: 50 },
      ]),
    },
    promotion: {
      findUnique: vi.fn().mockImplementation(({ where }) =>
        where.code === promo.code ? Promise.resolve(promo) : Promise.resolve(null),
      ),
    },
    order: {
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: mockOrder.id,
          userId: data.userId,
          status: data.status,
          promotionCode: data.promotionCode,
          subtotal: data.subtotal,
          discountAmount: data.discountAmount,
          total: data.total,
          createdAt: mockOrder.createdAt,
          items: data.items.create,
        }),
      ),
      findFirst: vi.fn().mockImplementation(({ where }) =>
        where.id === mockOrder.id && where.userId === mockOrder.userId
          ? Promise.resolve({ id: mockOrder.id, status: mockOrder.status })
          : Promise.resolve(null),
      ),
      findUnique: vi.fn().mockImplementation(({ where }) =>
        where.id === mockOrder.id ? Promise.resolve(mockOrder) : Promise.resolve(null),
      ),
      updateMany: vi.fn().mockImplementation(({ where, data }) => {
        if (where.id !== mockOrder.id || where.status !== mockOrder.status) {
          return Promise.resolve({ count: 0 });
        }
        mockOrder = { ...mockOrder, ...data };
        return Promise.resolve({ count: 1 });
      }),
      findUniqueOrThrow: vi.fn().mockImplementation(() => Promise.resolve(mockOrder)),
    },
    loyaltyTransaction: {
      createMany: vi.fn().mockImplementation(({ data }) => {
        const { orderId } = data[0] as { orderId: number };
        if (awardedOrders.has(orderId)) {
          return Promise.resolve({ count: 0 });
        }
        awardedOrders.add(orderId);
        return Promise.resolve({ count: 1 });
      }),
    },
    $transaction: vi.fn().mockImplementation((callback) => callback(mockPrisma)),
  };

  beforeAll(async () => {
    mockUser.passwordHash = await bcrypt.hash('password123', 10);
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
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: mockUser.email, password: 'password123' })
      .expect(200);
    token = login.body.accessToken as string;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockUser.loyaltyPoints = 0;
    awardedOrders.clear();
    mockOrder = {
      id: 100,
      userId: mockUser.id,
      status: OrderStatus.PENDING,
      paymentMethod: null,
      paidAt: null,
      subtotal: 58_000,
      discountAmount: 0,
      promotionCode: null,
      total: 58_000,
      createdAt: new Date(),
    };
  });

  it('creates an order with a valid promotion and server-calculated totals', async () => {
    const response = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: 1, size: 'M', quantity: 2, toppings: ['pearls'] }],
        promotionCode: 'brew10',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      promotionCode: 'BREW10',
      subtotal: 84_000,
      discountAmount: 8_400,
      total: 75_600,
    });
  });

  it('rejects invalid promotion codes and client-supplied money fields', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: 1, size: 'S', quantity: 1, toppings: [] }],
        promotionCode: 'NOPE',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: 1, size: 'S', quantity: 1, toppings: [] }],
        total: 1,
      })
      .expect(400);
  });

  it('awards points once for a successful payment and not for a repeated payment', async () => {
    const payment = {
      orderId: mockOrder.id,
      method: PaymentMethod.WALLET,
      simulateSuccess: true,
    };

    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${token}`)
      .send(payment)
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe(OrderStatus.PAID));

    expect(mockUser.loyaltyPoints).toBe(5);
    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${token}`)
      .send(payment)
      .expect(409);
    expect(mockUser.loyaltyPoints).toBe(5);
  });

  it('allows retry after PAYMENT_FAILED without awarding points until payment succeeds', async () => {
    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId: mockOrder.id,
        method: PaymentMethod.CARD,
        simulateSuccess: false,
      })
      .expect(200);
    expect(mockUser.loyaltyPoints).toBe(0);

    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId: mockOrder.id,
        method: PaymentMethod.CARD,
        simulateSuccess: true,
      })
      .expect(200);
    expect(mockOrder.status).toBe(OrderStatus.PAID);
    expect(mockUser.loyaltyPoints).toBe(5);
  });

  it('rejects a payment transition from a terminal state', async () => {
    mockOrder.status = OrderStatus.COMPLETED;

    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId: mockOrder.id,
        method: PaymentMethod.WALLET,
        simulateSuccess: true,
      })
      .expect(409);
    expect(mockUser.loyaltyPoints).toBe(0);
  });

  afterAll(async () => {
    await app.close();
  });
});
