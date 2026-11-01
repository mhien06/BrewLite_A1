import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { StaffService } from '../src/staff/staff.service.js';

process.env.JWT_SECRET ||= 'staff-test-only-secret-at-least-32-characters';
describe('Trang nhân viên với PostgreSQL thật', () => {
  let app: INestApplication;
  let db: PrismaService;
  let staffId: number,
    customerId: number,
    ingredientId: number,
    orderId: number;
  let staffToken: string, customerToken: string;
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
    const staff = await db.user.create({
      data: {
        email: `staff-${tag}@test.local`,
        passwordHash: 'unused',
        role: 'STAFF',
      },
    });
    const customer = await db.user.create({
      data: { email: `customer-${tag}@test.local`, passwordHash: 'unused' },
    });
    staffId = staff.id;
    customerId = customer.id;
    ingredientId = (
      await db.ingredient.create({
        data: { code: tag, name: 'Nguyên liệu test', unit: 'g', stock: 100 },
      })
    ).id;
    orderId = (
      await db.order.create({
        data: {
          userId: customerId,
          status: 'PAID',
          total: 30000,
          inventoryDeducted: true,
        },
      })
    ).id;
    const jwt = app.get(JwtService);
    staffToken = jwt.sign({ sub: staffId, email: staff.email });
    customerToken = jwt.sign({ sub: customerId, email: customer.email });
  });
  afterAll(async () => {
    if (db && staffId) {
      await db.inventoryMovement.deleteMany({ where: { actorId: staffId } });
      await db.order.deleteMany({ where: { id: orderId } });
      await db.ingredient.deleteMany({ where: { id: ingredientId } });
      await db.user.deleteMany({
        where: { id: { in: [staffId, customerId] } },
      });
    }
    await app?.close();
  });
  it('chặn truy cập chưa đăng nhập và khách hàng', async () => {
    await request(app.getHttpServer()).get('/staff/ingredients').expect(401);
    await request(app.getHttpServer())
      .get('/staff/ingredients')
      .auth(customerToken, { type: 'bearer' })
      .expect(403);
  });
  it('nhân viên không được tạo đơn hoặc thanh toán dù gọi API trực tiếp', async () => {
    const orderCount = await db.order.count({ where: { userId: staffId } });
    await request(app.getHttpServer())
      .post('/orders')
      .auth(staffToken, { type: 'bearer' })
      .send({ items: [] })
      .expect(403);
    await request(app.getHttpServer())
      .post('/payments')
      .auth(staffToken, { type: 'bearer' })
      .send({ orderId, method: 'WALLET', simulateSuccess: true })
      .expect(403);
    expect(await db.order.count({ where: { userId: staffId } })).toBe(
      orderCount,
    );
    expect(await db.payment.count({ where: { userId: staffId } })).toBe(0);
  });
  it('khách không tự cấp quyền STAFF khi đăng ký', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'self-role@test.local',
        name: 'Khách',
        password: 'password123',
        role: 'STAFF',
      })
      .expect(400);
  });
  it('hai điều chỉnh cùng phiên bản chỉ thành công một lần và có lịch sử', async () => {
    const send = () =>
      request(app.getHttpServer())
        .patch(`/staff/ingredients/${ingredientId}`)
        .auth(staffToken, { type: 'bearer' })
        .send({ delta: 20, version: 1, reason: 'Nhập kho thử' });
    const results = await Promise.all([send(), send()]);
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    expect(
      (await db.ingredient.findUniqueOrThrow({ where: { id: ingredientId } }))
        .stock,
    ).toBe(120);
    expect(await db.inventoryMovement.count({ where: { ingredientId } })).toBe(
      1,
    );
  });
  it('chặn kho âm, lý do trống và dữ liệu sai', async () => {
    for (const body of [
      { delta: -999, version: 2, reason: 'Hao hụt' },
      { delta: 5, version: 2, reason: '   ' },
      { delta: 1.5, version: 2, reason: 'Nhập kho' },
    ]) {
      await request(app.getHttpServer())
        .patch(`/staff/ingredients/${ingredientId}`)
        .auth(staffToken, { type: 'bearer' })
        .send(body)
        .expect(400);
    }
    expect(await db.inventoryMovement.count({ where: { ingredientId } })).toBe(
      1,
    );
  });
  it('chỉ cập nhật đúng trình tự, không thay đổi kho/điểm khi pha chế', async () => {
    const change = (status: string) =>
      request(app.getHttpServer())
        .patch(`/staff/orders/${orderId}/status`)
        .auth(staffToken, { type: 'bearer' })
        .send({ status });
    await change('COMPLETED').expect(409);
    await change('PAID').expect(400);
    for (const status of ['PREPARING', 'READY', 'COMPLETED'])
      await change(status).expect(200);
    await change('PREPARING').expect(409);
    expect(
      (await db.ingredient.findUniqueOrThrow({ where: { id: ingredientId } }))
        .stock,
    ).toBe(120);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: customerId } }))
        .loyaltyPoints,
    ).toBe(0);
  });
  it('điểm thưởng chỉ đọc và không trả mật khẩu', async () => {
    const response = await request(app.getHttpServer())
      .get('/staff/loyalty')
      .auth(staffToken, { type: 'bearer' })
      .expect(200);
    expect(
      response.body.every(
        (u: Record<string, unknown>) => !('passwordHash' in u),
      ),
    ).toBe(true);
    await request(app.getHttpServer())
      .patch('/staff/loyalty')
      .auth(staffToken, { type: 'bearer' })
      .send({ points: 999 })
      .expect(404);
  });
  it('rollback tồn kho nếu ghi lịch sử thất bại', async () => {
    const before = await db.ingredient.findUniqueOrThrow({
      where: { id: ingredientId },
    });
    await expect(
      app.get(StaffService).adjustStock(-1, ingredientId, {
        delta: 10,
        version: before.version,
        reason: 'Kiểm tra rollback',
      }),
    ).rejects.toThrow();
    const after = await db.ingredient.findUniqueOrThrow({
      where: { id: ingredientId },
    });
    expect(after.stock).toBe(before.stock);
    expect(after.version).toBe(before.version);
    expect(await db.inventoryMovement.count({ where: { ingredientId } })).toBe(
      1,
    );
  });
  it('thu hồi quyền có hiệu lực với JWT cũ', async () => {
    await db.user.update({
      where: { id: staffId },
      data: { role: 'CUSTOMER' },
    });
    await request(app.getHttpServer())
      .get('/staff/ingredients')
      .auth(staffToken, { type: 'bearer' })
      .expect(403);
  });
});
