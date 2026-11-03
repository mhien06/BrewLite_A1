import {
  type ExecutionContext,
  type INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { CustomerGuard } from '../src/auth/guards/customer.guard.js';
import { MAX_DATABASE_ID } from '../src/common/database-id.js';
import { InventoryController } from '../src/inventory/inventory.controller.js';
import { AvailabilityService } from '../src/inventory/availability.service.js';
import { OrdersController } from '../src/orders/orders.controller.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { PaymentsController } from '../src/payments/payments.controller.js';
import { PaymentsService } from '../src/payments/payments.service.js';
import { ProductsController } from '../src/products/products.controller.js';
import { ProductsService } from '../src/products/products.service.js';
import { StaffController } from '../src/staff/staff.controller.js';
import { StaffGuard } from '../src/staff/staff.guard.js';
import { StaffService } from '../src/staff/staff.service.js';

// Exercise real HTTP params, nested DTO validation and controller wiring without
// a database. Invalid IDs must never reach a service/Prisma query.
describe('Database ID validation (HTTP regression)', () => {
  let app: INestApplication;
  const products = { findOne: vi.fn() };
  const orders = { findOne: vi.fn(), create: vi.fn() };
  const payments = { create: vi.fn() };
  const inventory = { checkCart: vi.fn() };
  const staff = { adjustStock: vi.fn(), updateStatus: vi.fn() };
  const handlers = [
    ...Object.values(products),
    ...Object.values(orders),
    ...Object.values(payments),
    ...Object.values(inventory),
    ...Object.values(staff),
  ];
  const routes = [
    {
      method: 'get',
      path: '/products/',
      suffix: '',
      body: undefined,
      handler: products.findOne,
    },
    {
      method: 'get',
      path: '/orders/',
      suffix: '',
      body: undefined,
      handler: orders.findOne,
    },
    {
      method: 'patch',
      path: '/staff/ingredients/',
      suffix: '',
      body: { delta: 1, version: 1, reason: 'Stock check' },
      handler: staff.adjustStock,
    },
    {
      method: 'patch',
      path: '/staff/orders/',
      suffix: '/status',
      body: { status: 'READY' },
      handler: staff.updateStatus,
    },
  ] as const;
  const bodies = [
    {
      path: '/orders',
      status: 201,
      handler: orders.create,
      body: (id: unknown) => ({
        items: [{ productId: id, size: 'S', quantity: 1, toppings: [] }],
      }),
    },
    {
      path: '/payments',
      status: 200,
      handler: payments.create,
      body: (id: unknown) => ({
        orderId: id,
        method: 'WALLET',
        simulateSuccess: true,
      }),
    },
    {
      path: '/inventory/check-cart',
      status: 200,
      handler: inventory.checkCart,
      body: (id: unknown) => ({
        items: [{ productId: id, size: 'S', quantity: 1, toppings: [] }],
      }),
    },
  ];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        ProductsController,
        OrdersController,
        PaymentsController,
        InventoryController,
        StaffController,
      ],
      providers: [
        { provide: ProductsService, useValue: products },
        { provide: OrdersService, useValue: orders },
        { provide: PaymentsService, useValue: payments },
        { provide: AvailabilityService, useValue: inventory },
        { provide: StaffService, useValue: staff },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = { id: 1, role: 'CUSTOMER' };
          return true;
        },
      })
      .overrideGuard(CustomerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(StaffGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    for (const handler of handlers)
      handler.mockReset().mockResolvedValue({ ok: true });
  });
  afterAll(async () => {
    await app.close();
  });

  for (const route of routes) {
    describe(`${route.method.toUpperCase()} ${route.path}:id${route.suffix}`, () => {
      it.each(['0', '-1', '1.5', 'abc', '2147483648', '9007199254740992'])(
        'rejects ID %s with 400 before calling a service',
        async (id) => {
          const call = request(app.getHttpServer())[route.method](
            `${route.path}${id}${route.suffix}`,
          );
          if (route.body) call.send(route.body);
          await call.expect(400);
          for (const handler of handlers)
            expect(handler).not.toHaveBeenCalled();
        },
      );
      it.each([1, MAX_DATABASE_ID])('accepts boundary ID %s', async (id) => {
        const call = request(app.getHttpServer())[route.method](
          `${route.path}${id}${route.suffix}`,
        );
        if (route.body) call.send(route.body);
        await call.expect(200);
        expect(route.handler).toHaveBeenCalled();
      });
    });
  }

  for (const endpoint of bodies) {
    describe(`POST ${endpoint.path}`, () => {
      it.each([0, -1, 1.5, '1', 2147483648, 9007199254740992])(
        'rejects body ID %s with 400 before calling a service',
        async (id) => {
          await request(app.getHttpServer())
            .post(endpoint.path)
            .send(endpoint.body(id))
            .expect(400);
          for (const handler of handlers)
            expect(handler).not.toHaveBeenCalled();
        },
      );
      it.each([1, MAX_DATABASE_ID])(
        'accepts boundary body ID %s',
        async (id) => {
          await request(app.getHttpServer())
            .post(endpoint.path)
            .send(endpoint.body(id))
            .expect(endpoint.status);
          expect(endpoint.handler).toHaveBeenCalled();
        },
      );
    });
  }

  it.each(['/products/', '/orders/'])(
    'keeps 404 for a valid missing ID on %s',
    async (path) => {
      const handler = path === '/products/' ? products.findOne : orders.findOne;
      handler.mockRejectedValueOnce(new NotFoundException());
      await request(app.getHttpServer())
        .get(`${path}${MAX_DATABASE_ID}`)
        .expect(404);
    },
  );
});
