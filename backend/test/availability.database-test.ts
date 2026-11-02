import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

process.env.JWT_SECRET ||= 'availability-test-secret-not-for-production';
describe('API kiểm tra giỏ với PostgreSQL thật', () => {
  let app: INestApplication, db: PrismaService;
  let productId: number, coffeeId: number, creamId: number;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    db = app.get(PrismaService);
    const tag = crypto.randomUUID();
    coffeeId = (
      await db.ingredient.create({
        data: {
          code: `coffee-${tag}`,
          name: 'Cà phê test',
          unit: 'g',
          stock: 100,
        },
      })
    ).id;
    creamId = (
      await db.ingredient.create({
        data: { code: `cream-${tag}`, name: 'Kem test', unit: 'ml', stock: 40 },
      })
    ).id;
    productId = (
      await db.product.create({
        data: {
          name: `Món thử ${tag}`,
          price: 29000,
          imageUrl: '',
          stock: 999,
          recipes: {
            create: {
              ingredientId: coffeeId,
              amountS: 10,
              amountM: 25,
              amountL: 50,
            },
          },
        },
      })
    ).id;
    await db.toppingIngredient.create({
      data: { toppingCode: 'cream', ingredientId: creamId, amount: 40 },
    });
  });
  afterAll(async () => {
    if (db) {
      await db.toppingIngredient.deleteMany({
        where: { ingredientId: creamId },
      });
      await db.productIngredient.deleteMany({ where: { productId } });
      await db.product.deleteMany({ where: { id: productId } });
      await db.ingredient.deleteMany({
        where: { id: { in: [coffeeId, creamId] } },
      });
    }
    await app?.close();
  });
  const body = (quantity = 1, toppings: string[] = []) => ({
    items: [{ productId, size: 'M', quantity, toppings }],
  });
  it('khách chưa đăng nhập được kiểm tra, size M tính đúng và không trừ kho', async () => {
    const r = await request(app.getHttpServer())
      .post('/inventory/check-cart')
      .send(body())
      .expect(200);
    expect(r.body.items[0].maxQuantity).toBe(4);
    expect(
      (await db.ingredient.findUniqueOrThrow({ where: { id: coffeeId } }))
        .stock,
    ).toBe(100);
  });
  it('hết kem khóa topping nhưng món không kem vẫn còn', async () => {
    await db.ingredient.update({
      where: { id: creamId },
      data: { stock: 0, version: { increment: 1 } },
    });
    const r = await request(app.getHttpServer())
      .post('/inventory/check-cart')
      .send(body())
      .expect(200);
    expect(r.body.available).toBe(true);
    expect(
      r.body.items[0].toppings.find((t: { code: string }) => t.code === 'cream')
        .stockQuantity,
    ).toBe(0);
    const missing = await request(app.getHttpServer())
      .post('/inventory/check-cart')
      .send(body(1, ['cream']))
      .expect(200);
    expect(missing.body.available).toBe(false);
    expect(missing.body.items[0].message).toContain('Kem sữa');
  });
  it('kiểm tra toàn giỏ, không coi từng dòng như có kho độc lập', async () => {
    const r = await request(app.getHttpServer())
      .post('/inventory/check-cart')
      .send({ items: [body(3).items[0], body(2).items[0]] })
      .expect(200);
    expect(r.body.available).toBe(false);
  });
  it('validate size, số lượng, topping và chặn trường nội bộ', async () => {
    for (const item of [
      { ...body().items[0], size: 'XL' },
      { ...body().items[0], quantity: -1 },
      { ...body().items[0], toppings: ['fake'] },
      { ...body().items[0], stock: 999 },
    ])
      await request(app.getHttpServer())
        .post('/inventory/check-cart')
        .send({ items: [item] })
        .expect(400);
    await request(app.getHttpServer())
      .post('/inventory/check-cart')
      .send({ items: Array(101).fill(body().items[0]) })
      .expect(400);
  });
});
