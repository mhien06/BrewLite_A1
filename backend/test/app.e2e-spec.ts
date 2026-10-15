import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

describe('BrewLite API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
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

  afterAll(async () => {
    await app.close();
  });
});
