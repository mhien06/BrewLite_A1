import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Auth & Protected Orders API (e2e)', () => {
  let app: INestApplication<App>;

  const mockUsers: Array<{
    id: number;
    email: string;
    name: string;
    passwordHash: string;
    loyaltyPoints: number;
    createdAt: Date;
  }> = [];

  const mockPrisma = {
    user: {
      findUnique: vi.fn().mockImplementation(({ where }) => {
        if (where.id) {
          return Promise.resolve(mockUsers.find((u) => u.id === where.id) ?? null);
        }
        if (where.email) {
          return Promise.resolve(mockUsers.find((u) => u.email === where.email) ?? null);
        }
        return Promise.resolve(null);
      }),
      create: vi.fn().mockImplementation(({ data }) => {
        const newUser = {
          id: mockUsers.length + 1,
          email: data.email,
          name: data.name,
          passwordHash: data.passwordHash,
          loyaltyPoints: data.loyaltyPoints ?? 0,
          createdAt: new Date(),
        };
        mockUsers.push(newUser);
        return Promise.resolve(newUser);
      }),
    },
    product: {
      findMany: vi.fn().mockResolvedValue([
        { id: 1, name: 'Cà phê sữa', price: 29000, stock: 50 },
      ]),
    },
    order: {
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 100,
          userId: data.userId,
          status: data.status,
          total: data.total,
          createdAt: new Date(),
          items: data.items.create,
        }),
      ),
    },
    $transaction: vi.fn().mockImplementation((cb) => cb(mockPrisma)),
  };

  beforeAll(async () => {
    // Seed an initial user
    const hash = await bcrypt.hash('password123', 10);
    mockUsers.push({
      id: 1,
      email: 'existing@gmail.com',
      name: 'NGUYEN VAN A',
      passwordHash: hash,
      loyaltyPoints: 50,
      createdAt: new Date(),
    });

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
  });

  describe('POST /auth/register', () => {
    it('đăng ký thành công tài khoản mới với Tên in hoa và email @gmail.com', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'TRAN VAN B',
          email: 'newuser@gmail.com',
          password: 'secretPassword123',
        })
        .expect(201);

      expect(res.body.user).toMatchObject({
        email: 'newuser@gmail.com',
        name: 'TRAN VAN B',
        loyaltyPoints: 0,
      });
      expect(res.body).not.toHaveProperty('accessToken');

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'newuser@gmail.com',
          password: 'secretPassword123',
        })
        .expect(200);

      expect(loginRes.body.user).toMatchObject({
        email: 'newuser@gmail.com',
        name: 'TRAN VAN B',
      });
    });

    it('từ chối khi tên có số hoặc chữ thường (400)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'Tran Van B',
          email: 'user1@gmail.com',
          password: 'password123',
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'TRAN VAN 123',
          email: 'user2@gmail.com',
          password: 'password123',
        })
        .expect(400);
    });

    it('từ chối khi email không có đuôi @gmail.com (.co, @yahoo, ...) (400)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'LE THI C',
          email: 'user@gmail.co',
          password: 'password123',
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'LE THI C',
          email: 'user@yahoo.com',
          password: 'password123',
        })
        .expect(400);
    });

    it('từ chối khi mật khẩu quá ngắn (< 6 ký tự) (400)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'LE THI C',
          email: 'valid@gmail.com',
          password: '123',
        })
        .expect(400);
    });

    it('từ chối khi email đã tồn tại (409 Conflict)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          name: 'NGUYEN VAN A',
          email: 'existing@gmail.com',
          password: 'password123',
        })
        .expect(409);
    });
  });

  describe('POST /auth/login', () => {
    it('đăng nhập thành công với thông tin chính xác (200 OK + JWT)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'existing@gmail.com',
          password: 'password123',
        })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body.user).toMatchObject({
        id: 1,
        email: 'existing@gmail.com',
        name: 'NGUYEN VAN A',
      });
    });

    it('từ chối đăng nhập khi sai mật khẩu (401)', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'existing@gmail.com',
          password: 'wrongPassword',
        })
        .expect(401);
    });

    it('từ chối đăng nhập khi email không tồn tại (401)', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'nonexistent@gmail.com',
          password: 'password123',
        })
        .expect(401);
    });
  });

  describe('GET /auth/me & Protected route guard', () => {
    it('trả 401 Unauthorized khi truy cập /auth/me không có token', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('trả 200 OK cùng thông tin user khi có Bearer token hợp lệ', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'existing@gmail.com',
          password: 'password123',
        });

      const token = loginRes.body.accessToken;

      const meRes = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(meRes.body).toMatchObject({
        id: 1,
        email: 'existing@gmail.com',
        name: 'NGUYEN VAN A',
      });
    });
  });

  describe('POST /orders Guard Protection', () => {
    const validOrderPayload = {
      items: [
        {
          productId: 1,
          size: 'M',
          quantity: 1,
          toppings: ['pearls'],
        },
      ],
    };

    it('chặn đặt đơn khi không có Bearer token (401 Unauthorized)', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .send(validOrderPayload)
        .expect(401);
    });

    it('chặn đặt đơn khi token không hợp lệ (401 Unauthorized)', async () => {
      await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', 'Bearer invalid-token-xyz')
        .send(validOrderPayload)
        .expect(401);
    });

    it('cho phép đặt đơn khi có Bearer token hợp lệ và lưu đúng userId (201 Created)', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'existing@gmail.com',
          password: 'password123',
        });

      const token = loginRes.body.accessToken;

      const orderRes = await request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${token}`)
        .send(validOrderPayload)
        .expect(201);

      expect(orderRes.body).toMatchObject({
        id: 100,
        userId: 1,
        status: 'PENDING',
      });
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
