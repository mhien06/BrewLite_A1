import { VnpayService } from '../src/payments/vnpay/vnpay.service.js';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { OrderStateService } from '../src/orders/order-state.service.js';
import { OrderExpiryService } from '../src/payments/order-expiry.service.js';
import { VnpayIpnService } from '../src/payments/vnpay/vnpay-ipn.service.js';
import { VnpayRefundService } from '../src/payments/vnpay/vnpay-refund.service.js';
import { VnpayTransactionApiService } from '../src/payments/vnpay/vnpay-transaction-api.service.js';
import { InventoryService } from '../src/inventory/inventory.service.js';
import { LoyaltyService } from '../src/loyalty/loyalty.service.js';
import { signVnpayParams } from '../src/payments/vnpay/vnpay-signature.js';

describe('Expiry, late IPN and refunds on PostgreSQL', () => {
  const db = new PrismaService();
  const db2 = new PrismaService();
  const states = new OrderStateService(db);
  const inventory = new InventoryService(db);
  const ipn = new VnpayIpnService(db, states, inventory, new LoyaltyService());
  const gateway = { refundTransaction: vi.fn(), queryTransaction: vi.fn() };
  const refunds = new VnpayRefundService(
    db,
    gateway as unknown as VnpayTransactionApiService,
  );
  let userId: number;
  let productId: number;
  let ingredientId: number;
  let orderId: number;
  let paymentId: number;
  let txnRef: string;
  const future = () => new Date(Date.now() + 15 * 60_000);
  const past = () => new Date(Date.now() - 20 * 60_000);
  const result = (status = '00', type = '02', code = '00') => ({
    vnp_ResponseCode: code,
    vnp_TransactionStatus: status,
    vnp_TransactionType: type,
  });
  function query(success = true) {
    const values = {
      vnp_TmnCode: 'TESTCODE',
      vnp_TxnRef: txnRef,
      vnp_Amount: '3000000',
      vnp_ResponseCode: success ? '00' : '24',
      vnp_TransactionStatus: success ? '00' : '02',
      vnp_TransactionNo: '123456',
      vnp_PayDate: '20261107100000',
    };
    return {
      ...values,
      vnp_SecureHash: signVnpayParams(values, 'test-secret'),
    };
  }
  async function queueRefund() {
    await db.payment.update({
      where: { id: paymentId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        refundRequestedAt: new Date(),
        refundStatus: 'QUEUED',
      },
    });
  }
  const payment = () =>
    db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  const order = () => db.order.findUniqueOrThrow({ where: { id: orderId } });
  const stock = async () =>
    (await db.ingredient.findUniqueOrThrow({ where: { id: ingredientId } }))
      .stock;
  beforeAll(async () => {
    await db.$connect();
    await db2.$connect();
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    process.env.VNPAY_TMN_CODE = 'TESTCODE';
    process.env.VNPAY_HASH_SECRET = 'test-secret';
    process.env.VNPAY_RETURN_URL = 'https://example.test/payments/vnpay/return';
    process.env.VNPAY_PAYMENT_EXPIRY_MINUTES = '15';
    txnRef = crypto.randomUUID();
    userId = (
      await db.user.create({
        data: { email: `${txnRef}@test.local`, passwordHash: 'test-only' },
      })
    ).id;
    productId = (
      await db.product.create({
        data: { name: txnRef, price: 30000, stock: 100, imageUrl: '/test.png' },
      })
    ).id;
    ingredientId = (
      await db.ingredient.create({
        data: { name: 'Test', code: txnRef, unit: 'g', stock: 100 },
      })
    ).id;
    await db.productIngredient.create({
      data: { productId, ingredientId, amountS: 20, amountM: 25, amountL: 30 },
    });
    orderId = (
      await db.order.create({
        data: {
          userId,
          subtotal: 30000,
          total: 30000,
          items: {
            create: {
              productId,
              size: 'S',
              quantity: 1,
              unitPrice: 30000,
              lineTotal: 30000,
            },
          },
        },
      })
    ).id;
    paymentId = (
      await db.payment.create({
        data: {
          userId,
          orderId,
          idempotencyKey: txnRef,
          amount: 30000,
          method: 'VNPAY',
          status: 'PENDING',
          providerTxnRef: txnRef,
          expiresAt: future(),
        },
      })
    ).id;
    gateway.refundTransaction.mockResolvedValue(result());
    gateway.queryTransaction.mockResolvedValue(result());
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await db.inventoryMovement.deleteMany({ where: { ingredientId } });
    await db.payment.deleteMany({ where: { userId } });
    await db.loyaltyTransaction.deleteMany({ where: { userId } });
    await db.order.deleteMany({ where: { userId } });
    await db.productIngredient.deleteMany({ where: { productId } });
    await db.product.delete({ where: { id: productId } });
    await db.ingredient.delete({ where: { id: ingredientId } });
    await db.user.delete({ where: { id: userId } });
  });
  afterAll(async () => {
    await db.$disconnect();
    await db2.$disconnect();
  });

  it('restarted server cancels expired order once without restoring undeducted stock', async () => {
    await db.payment.update({
      where: { id: paymentId },
      data: { expiresAt: past() },
    });
    await Promise.all([
      new OrderExpiryService(db, states).expireDueOrders(),
      new OrderExpiryService(db2, new OrderStateService(db2)).expireDueOrders(),
    ]);
    expect(await order()).toMatchObject({
      status: 'CANCELLED',
      cancellationSource: 'SYSTEM',
      inventoryDeducted: false,
    });
    expect(await stock()).toBe(100);
    expect((await payment()).status).toBe('PENDING');
    expect(await db.inventoryMovement.count({ where: { ingredientId } })).toBe(
      0,
    );
  });
  it('rejects a new payment URL after the saved deadline', async () => {
    await db.payment.update({
      where: { id: paymentId },
      data: { expiresAt: past() },
    });
    await expect(
      new VnpayService(db, states).createPaymentUrl(
        userId,
        { orderId, locale: 'vn' },
        crypto.randomUUID(),
        '127.0.0.1',
      ),
    ).rejects.toThrow('hết thời hạn');
    expect(await db.payment.count({ where: { orderId } })).toBe(1);
  });
  it('does not replay an old pending payment URL after the customer cancels', async () => {
    await states.transition(
      orderId,
      'CANCELLED',
      undefined,
      {},
      userId,
      userId,
    );
    await expect(
      new VnpayService(db, states).createPaymentUrl(
        userId,
        { orderId, locale: 'vn' },
        txnRef,
        '127.0.0.1',
      ),
    ).rejects.toThrow('không còn cho phép');
  });
  it('an older failed callback does not fail a newer payment attempt', async () => {
    await db.payment.create({
      data: {
        userId,
        orderId,
        idempotencyKey: crypto.randomUUID(),
        amount: 30000,
        method: 'VNPAY',
        status: 'PENDING',
        providerTxnRef: crypto.randomUUID(),
        expiresAt: future(),
      },
    });
    expect((await ipn.handle(query(false))).RspCode).toBe('00');
    expect((await order()).status).toBe('PENDING');
    expect((await payment()).status).toBe('PAYMENT_FAILED');
  });
  it('does not cancel a fresh attempt even if the order is old', async () => {
    await db.order.update({
      where: { id: orderId },
      data: { createdAt: past() },
    });
    await new OrderExpiryService(db, states).expireDueOrders();
    expect((await order()).status).toBe('PENDING');
  });
  it('cancels an abandoned checkout that never created a payment', async () => {
    await db.payment.delete({ where: { id: paymentId } });
    await db.order.update({
      where: { id: orderId },
      data: { createdAt: past() },
    });
    await new OrderExpiryService(db, states).expireDueOrders();
    expect((await order()).cancellationSource).toBe('SYSTEM');
  });
  it('does not cancel an already paid order', async () => {
    expect((await ipn.handle(query())).RspCode).toBe('00');
    await db.payment.update({
      where: { id: paymentId },
      data: { expiresAt: past() },
    });
    await new OrderExpiryService(db, states).expireDueOrders();
    expect((await order()).status).toBe('PAID');
    expect(await stock()).toBe(80);
  });
  it('records late success after expiry as a refund, not a served order', async () => {
    await db.payment.update({
      where: { id: paymentId },
      data: { expiresAt: past() },
    });
    expect((await ipn.handle(query())).RspCode).toBe('00');
    expect((await order()).status).toBe('CANCELLED');
    expect(await payment()).toMatchObject({
      status: 'PAID',
      refundStatus: 'QUEUED',
    });
    expect(await stock()).toBe(100);
    expect((await ipn.handle(query())).RspCode).toBe('02');
  });
  it('customer cannot cancel another customer order', async () => {
    await expect(
      states.transition(
        orderId,
        'CANCELLED',
        undefined,
        {},
        userId + 1,
        userId + 1,
      ),
    ).rejects.toThrow('Không tìm thấy');
    expect((await order()).status).toBe('PENDING');
  });
  it('failed IPN after customer cancellation keeps order cancelled and records failure once', async () => {
    await states.transition(
      orderId,
      'CANCELLED',
      undefined,
      {},
      userId,
      userId,
    );
    expect((await ipn.handle(query(false))).RspCode).toBe('00');
    expect((await ipn.handle(query(false))).RspCode).toBe('02');
    expect((await order()).status).toBe('CANCELLED');
    expect(await payment()).toMatchObject({
      status: 'PAYMENT_FAILED',
      providerResponseCode: '24',
      refundStatus: null,
    });
  });
  it('success after customer cancellation queues one refund under concurrent callbacks', async () => {
    await states.transition(
      orderId,
      'CANCELLED',
      undefined,
      {},
      userId,
      userId,
    );
    const responses = await Promise.all([
      ipn.handle(query()),
      ipn.handle(query()),
    ]);
    expect(responses.map((r) => r.RspCode).sort()).toEqual(['00', '02']);
    expect((await payment()).refundStatus).toBe('QUEUED');
    expect(await stock()).toBe(100);
  });
  it('paid cancellation and callback cannot deadlock or restore twice', async () => {
    await ipn.handle(query());
    await Promise.all([
      states.transition(orderId, 'CANCELLED'),
      ipn.handle(query()),
      states.transition(orderId, 'CANCELLED'),
    ]);
    expect(await stock()).toBe(100);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: userId } }))
        .loyaltyPoints,
    ).toBe(0);
    expect((await payment()).refundStatus).toBe('QUEUED');
    expect(await db.inventoryMovement.count({ where: { ingredientId } })).toBe(
      1,
    );
  });
  it('cannot cancel once preparation has started', async () => {
    await ipn.handle(query());
    await states.transition(orderId, 'PREPARING');
    await expect(states.transition(orderId, 'CANCELLED')).rejects.toThrow();
    expect(await stock()).toBe(80);
    expect((await payment()).refundStatus).toBeNull();
  });
  it('verified payment without stock is recorded and queued for refund', async () => {
    await db.ingredient.update({
      where: { id: ingredientId },
      data: { stock: 0 },
    });
    expect((await ipn.handle(query())).RspCode).toBe('00');
    expect((await order()).status).toBe('CANCELLED');
    expect((await payment()).refundStatus).toBe('QUEUED');
    expect(await stock()).toBe(0);
  });
  it('rolls back partial stock deduction before recording refund', async () => {
    vi.spyOn(inventory, 'deductForPaidOrder').mockImplementation(async (tx) => {
      await tx.ingredient.update({
        where: { id: ingredientId },
        data: { stock: { decrement: 20 } },
      });
      throw new ConflictException('Kho vừa thay đổi');
    });
    expect((await ipn.handle(query())).RspCode).toBe('00');
    expect(await stock()).toBe(100);
    expect((await payment()).refundStatus).toBe('QUEUED');
  });
  it('two workers send a queued refund only once', async () => {
    await queueRefund();
    const second = new VnpayRefundService(
      db2,
      gateway as unknown as VnpayTransactionApiService,
    );
    await Promise.all([refunds.processRefunds(), second.processRefunds()]);
    expect(gateway.refundTransaction).toHaveBeenCalledTimes(1);
    expect(await payment()).toMatchObject({
      refundStatus: 'SUCCEEDED',
      refundCompletedAt: expect.any(Date),
    });
  });
  it('ambiguous timeout survives restart and queries instead of resending refund', async () => {
    await queueRefund();
    gateway.refundTransaction.mockRejectedValue(new Error('timeout'));
    const now = new Date();
    await refunds.processRefunds(now);
    expect((await payment()).refundStatus).toBe('PENDING');
    const restarted = new VnpayRefundService(
      db,
      gateway as unknown as VnpayTransactionApiService,
    );
    await restarted.processRefunds(new Date(now.getTime() + 61_000));
    expect(gateway.refundTransaction).toHaveBeenCalledTimes(1);
    expect(gateway.queryTransaction).toHaveBeenCalledTimes(1);
    expect((await payment()).refundStatus).toBe('SUCCEEDED');
  });
  it('successful original payment query does not count as refund success', async () => {
    await queueRefund();
    gateway.refundTransaction.mockResolvedValue(result('05'));
    const now = new Date();
    await refunds.processRefunds(now);
    gateway.queryTransaction.mockResolvedValue(result('00', '01'));
    await refunds.processRefunds(new Date(now.getTime() + 61_000));
    expect(await payment()).toMatchObject({
      refundStatus: 'PENDING',
      refundCompletedAt: null,
    });
    await expect(refunds.retryRejectedRefund(paymentId)).rejects.toThrow();
  });
  it('explicitly rejected refund can be retried but cannot be claimed twice', async () => {
    await queueRefund();
    gateway.refundTransaction.mockResolvedValue(result('09'));
    await refunds.processRefunds();
    expect((await payment()).refundStatus).toBe('FAILED');
    const retries = await Promise.allSettled([
      refunds.retryRejectedRefund(paymentId),
      refunds.retryRejectedRefund(paymentId),
    ]);
    expect(retries.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    gateway.refundTransaction.mockResolvedValue(result());
    await refunds.processRefunds();
    expect((await payment()).refundStatus).toBe('SUCCEEDED');
  });
});
