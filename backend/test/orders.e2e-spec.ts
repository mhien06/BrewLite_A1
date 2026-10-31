import './setup-jwt-secret.js';
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

describe('Orders API (e2e) - T09A', () => {
  let app: INestApplication<App>;
  let accessToken: string;

  const mockUser = {
    id: 1,
    email: 't09user@gmail.com',
    name: 'TEST USER T09',
    passwordHash: '',
    loyaltyPoints: 10,
    createdAt: new Date(),
  };

  const mockOrder = {
    id: 50,
    userId: mockUser.id,
    status: OrderStatus.PAID,
    paymentMethod: PaymentMethod.WALLET,
    paidAt: new Date(),
    total: 80_000,
    createdAt: new Date(),
    items: [
      {
        id: 1,
        productId: 1,
        size: 'M',
        toppings: ['pearls'],
        quantity: 2,
        unitPrice: 40000,
        lineTotal: 80000,
        product: {
          id: 1,
          name: 'Cà phê sữa',
          imageUrl: '/products/ca-phe-sua.jpg',
        },
      },
    ],
  };

  const mockPrisma = {
    user: {
      findUnique: vi.fn().mockImplementation(({ where }) => {
        if (where.id === mockUser.id || where.email === mockUser.email) {
          return Promise.resolve(mockUser);
        }
        return Promise.resolve(null);
      }),
    },
    order: {
      findMany: vi.fn().mockImplementation(({ where }) => {
        if (where.userId === mockUser.id) {
          return Promise.resolve([mockOrder]);
        }
        return Promise.resolve([]);
      }),
      findFirst: vi.fn().mockImplementation(({ where }) => {
        if (where.id === mockOrder.id && where.userId === mockOrder.userId) {
          return Promise.resolve(mockOrder);
        }
        return Promise.resolve(null);
      }),
    },
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
  });

  describe('GET /orders/me', () => {
    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer()).get('/orders/me').expect(401);
    });

    it('returns orders list for authenticated user', async () => {
      const response = await request(app.getHttpServer())
        .get('/orders/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
      expect(response.body[0].id).toBe(mockOrder.id);
      expect(response.body[0].items[0].product.name).toBe('Cà phê sữa');
    });
  });

  describe('GET /orders/:id', () => {
    it('rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer()).get(`/orders/${mockOrder.id}`).expect(401);
    });

    it('rejects invalid non-numeric order id with 400', async () => {
      await request(app.getHttpServer())
        .get('/orders/invalid-id')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('returns 404 if order does not exist or belongs to another user', async () => {
      await request(app.getHttpServer())
        .get('/orders/999')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('returns order detail when requested by owner', async () => {
      const response = await request(app.getHttpServer())
        .get(`/orders/${mockOrder.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.id).toBe(mockOrder.id);
      expect(response.body.total).toBe(80000);
      expect(response.body.status).toBe(OrderStatus.PAID);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
