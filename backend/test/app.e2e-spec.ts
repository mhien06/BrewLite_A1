import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('BrewLite API (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/products (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get('/products')
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body[0]).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        name: expect.any(String),
        price: expect.any(Number),
        imageUrl: expect.any(String),
        stock: expect.any(Number),
      }),
    );
  });

  it('/products/:id (GET)', async () => {
    const productsResponse = await request(app.getHttpServer())
      .get('/products')
      .expect(200);

    const productId = productsResponse.body[0].id as number;

    const response = await request(app.getHttpServer())
      .get(`/products/${productId}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: productId,
        name: expect.any(String),
        price: expect.any(Number),
        imageUrl: expect.any(String),
        stock: expect.any(Number),
      }),
    );
  });

  it('/products/:id returns 404 when missing', () => {
    return request(app.getHttpServer()).get('/products/2147483647').expect(404);
  });

  it('/products/:id returns 400 for invalid id', () => {
    return request(app.getHttpServer()).get('/products/abc').expect(400);
  });

  it('POST /orders creates a pending order with a server-calculated total', async () => {
    const productsResponse = await request(app.getHttpServer())
      .get('/products')
      .expect(200);
    const product = productsResponse.body[0] as { id: number; price: number };

    const response = await request(app.getHttpServer())
      .post('/orders')
      .send({
        items: [
          {
            productId: product.id,
            size: 'M',
            quantity: 2,
            toppings: ['pearls'],
          },
        ],
      })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: expect.any(Number),
        status: 'PENDING',
        total: (product.price + 5_000 + 8_000) * 2,
        items: [
          expect.objectContaining({
            productId: product.id,
            size: 'M',
            toppings: ['pearls'],
            quantity: 2,
            unitPrice: product.price + 13_000,
            lineTotal: (product.price + 13_000) * 2,
          }),
        ],
      }),
    );

    await prisma.order.delete({ where: { id: response.body.id as number } });
  });

  it('POST /orders rejects an invalid cart without creating an order', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .send({
        items: [{ productId: 1, size: 'XL', quantity: 0, toppings: ['syrup'] }],
      })
      .expect(400);
  });

  afterAll(async () => {
    await app.close();
  });
});
