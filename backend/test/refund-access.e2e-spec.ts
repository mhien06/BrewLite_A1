import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import { VnpayRefundController } from '../src/payments/vnpay/vnpay-refund.controller.js';
import { VnpayRefundService } from '../src/payments/vnpay/vnpay-refund.service.js';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard.js';
import { StaffGuard } from '../src/staff/staff.guard.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Refund retry permissions', () => {
  let app: INestApplication;
  const retry = vi.fn();
  const findUser = vi.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [VnpayRefundController],
      providers: [
        {
          provide: VnpayRefundService,
          useValue: { retryRejectedRefund: retry },
        },
        {
          provide: PrismaService,
          useValue: { user: { findUnique: findUser } },
        },
        StaffGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = { id: 1 };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    retry.mockResolvedValue({ message: 'queued' });
  });
  afterAll(async () => {
    await app.close();
  });
  it('rejects customers using the role in the database', async () => {
    findUser.mockResolvedValue({ role: 'CUSTOMER' });
    await request(app.getHttpServer())
      .post('/payments/vnpay/refunds/1/retry')
      .expect(403);
    expect(retry).not.toHaveBeenCalled();
  });
  it('allows staff to request a retry', async () => {
    findUser.mockResolvedValue({ role: 'STAFF' });
    await request(app.getHttpServer())
      .post('/payments/vnpay/refunds/1/retry')
      .expect(201);
    expect(retry).toHaveBeenCalledWith(1, 1);
  });
  it('rejects invalid IDs before sending a refund', async () => {
    findUser.mockResolvedValue({ role: 'STAFF' });
    await request(app.getHttpServer())
      .post('/payments/vnpay/refunds/0/retry')
      .expect(400);
    expect(retry).not.toHaveBeenCalled();
  });
});
