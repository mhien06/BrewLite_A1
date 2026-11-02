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
import { OrderStatus, PaymentMethod } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Payments API (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;

  const mockUser = {
    id: 1,
    email: 'payer@gmail.com',
    name: 'NGUYEN VAN A',
    passwordHash: '',
    loyaltyPoints: 0,
    createdAt: new Date(),
  };
  const awardedOrders = new Set<number>();

  type MockOrder = {
    id: number;
    userId: number;
    status: OrderStatus;
    paymentMethod: PaymentMethod | null;
    paidAt: Date | null;
    total: number;
    createdAt: Date;
  };

  let mockOrder: MockOrder = {
    id: 100,
    userId: mockUser.id,
    status: OrderStatus.PENDING,
    paymentMethod: null as PaymentMethod | null,
    paidAt: null as Date | null,
    total: 58_000,
    createdAt: new Date(),
  };

  const mockPrisma = {
    user: {
      findUnique: vi.fn().mockImplementation(({ where }) => {
        if (where.id === mockUser.id) {
          return Promise.resolve(mockUser);
        }

        if (where.email === mockUser.email) {
          return Promise.resolve(mockUser);
        }

        return Promise.resolve(null);
      }),
      update: vi.fn().mockImplementation(({ data }) => {
        mockUser.loyaltyPoints += data.loyaltyPoints.increment;
        return Promise.resolve(mockUser);
      }),
    },
    order: {
      findFirst: vi.fn().mockImplementation(({ where }) => {
        if (where.id === mockOrder.id && where.userId === mockOrder.userId) {
          return Promise.resolve({
            id: mockOrder.id,
            status: mockOrder.status,
          });
        }

        return Promise.resolve(null);
      }),
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
        const entry = data[0] as { orderId: number };
        if (awardedOrders.has(entry.orderId)) {
          return Promise.resolve({ count: 0 });
        }
        awardedOrders.add(entry.orderId);
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

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: mockUser.email,
        password: 'password123',
      })
      .expect(200);

    accessToken = loginResponse.body.accessToken as string;
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockOrder = {
      id: 100,
      userId: mockUser.id,
      status: OrderStatus.PENDING,
      paymentMethod: null,
      paidAt: null,
      total: 58_000,
      createdAt: new Date(),
    };
    mockUser.loyaltyPoints = 0;
    awardedOrders.clear();
  });

  it('returns 401 without an access token', () => {
    return request(app.getHttpServer())
      .post('/payments')
      .send({
        orderId: mockOrder.id,
        method: PaymentMethod.WALLET,
        simulateSuccess: true,
      })
      .expect(401);
  });

  it('returns 400 for an invalid payment method', () => {
    return request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        orderId: mockOrder.id,
        method: 'CASH',
        simulateSuccess: true,
      })
      .expect(400);
  });

  it('sets PAYMENT_FAILED when mock payment fails', async () => {
    const response = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        orderId: mockOrder.id,
        method: PaymentMethod.CARD,
        simulateSuccess: false,
      })
      .expect(200);

    expect(response.body).toMatchObject({
      id: mockOrder.id,
      status: OrderStatus.PAYMENT_FAILED,
      paymentMethod: PaymentMethod.CARD,
      paidAt: null,
      total: 58_000,
    });
  });

  it('sets PAID when mock payment succeeds', async () => {
    const response = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        orderId: mockOrder.id,
        method: PaymentMethod.WALLET,
        simulateSuccess: true,
      })
      .expect(200);

    expect(response.body).toMatchObject({
      id: mockOrder.id,
      status: OrderStatus.PAID,
      paymentMethod: PaymentMethod.WALLET,
      total: 58_000,
    });
    expect(response.body.paidAt).toEqual(expect.any(String));
    expect(mockUser.loyaltyPoints).toBe(5);
  });

  it('allows a failed payment to be retried', async () => {
    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        orderId: mockOrder.id,
        method: PaymentMethod.CARD,
        simulateSuccess: false,
      })
      .expect(200);

    const response = await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        orderId: mockOrder.id,
        method: PaymentMethod.CARD,
        simulateSuccess: true,
      })
      .expect(200);

    expect(response.body.status).toBe(OrderStatus.PAID);
    expect(mockUser.loyaltyPoints).toBe(5);
  });

  it('rejects an order that is already paid', async () => {
    mockOrder.status = OrderStatus.PAID;

    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        orderId: mockOrder.id,
        method: PaymentMethod.WALLET,
        simulateSuccess: true,
      })
      .expect(409);
  });

  it('does not expose an order owned by another user', async () => {
    mockOrder.userId = 999;

    await request(app.getHttpServer())
      .post('/payments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        orderId: mockOrder.id,
        method: PaymentMethod.WALLET,
        simulateSuccess: true,
      })
      .expect(404);
  });

  afterAll(async () => {
    await app.close();
  });
});
