import { VnpayReconciliationService } from '../src/payments/vnpay/vnpay-reconciliation.service.js';
import { VnpayTransactionApiService } from '../src/payments/vnpay/vnpay-transaction-api.service.js';
import { signedQueryResult } from './vnpay-query-fixture.js';
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
import { PrismaService } from '../src/prisma/prisma.service.js';
import { OrderStateService } from '../src/orders/order-state.service.js';
import { VnpayIpnService } from '../src/payments/vnpay/vnpay-ipn.service.js';
import { InventoryService } from '../src/inventory/inventory.service.js';
import { LoyaltyService } from '../src/loyalty/loyalty.service.js';
import { signVnpayParams } from '../src/payments/vnpay/vnpay-signature.js';

describe('Missing IPN reconciliation on PostgreSQL', () => {
  const db = new PrismaService();
  const db2 = new PrismaService();
  const states = new OrderStateService(db);
  const inventory = new InventoryService(db);
  const ipn = new VnpayIpnService(db, states, inventory, new LoyaltyService());
  const fetchMock = vi.fn();
  const gateway = new VnpayTransactionApiService();
  const worker = (database = db) =>
    new VnpayReconciliationService(
      database,
      gateway,
      new VnpayIpnService(
        database,
        new OrderStateService(database),
        new InventoryService(database),
        new LoyaltyService(),
      ),
    );
  let userId: number;
  let productId: number;
  let ingredientId: number;
  let orderId: number;
  let paymentId: number;
  let txnRef: string;
  const future = () => new Date(Date.now() + 15 * 60_000);
  const past = () => new Date(Date.now() - 6 * 60_000);
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
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => signedQueryResult({ vnp_TxnRef: txnRef }),
    }));
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
          createdAt: past(),
        },
      })
    ).id;
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await db.inventoryMovement.deleteMany({ where: { ingredientId } });
    await db.refund.deleteMany({ where: { paymentId } });
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

  async function assertPaidOnce() {
    expect((await payment()).status).toBe('PAID');
    expect((await order()).status).toBe('PAID');
    expect(await stock()).toBe(80);
    expect(await db.loyaltyTransaction.count({ where: { orderId } })).toBe(1);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: userId } }))
        .loyaltyPoints,
    ).toBe(3);
    expect(await db.refund.count({ where: { paymentId } })).toBe(0);
  }

  it('settles a missing IPN through the real API verifier and real inventory/loyalty services', async () => {
    await worker().reconcilePendingPayments();
    await assertPaidOnce();
    expect(await payment()).toMatchObject({
      reconciliationAttempts: 1,
      reconciliationResult: 'CONFIRMED',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.vnp_Command).toBe('querydr');
    expect(body.vnp_TransactionDate).toMatch(/^\d{14}$/);
    await worker().reconcilePendingPayments();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ignores a late IPN after QueryDR without deducting stock or awarding points twice', async () => {
    await worker().reconcilePendingPayments();
    expect((await ipn.handle(query())).RspCode).toBe('02');
    await assertPaidOnce();
  });

  it.each(['PENDING', 'CANCELLED'] as const)(
    'serializes simultaneous IPN and QueryDR for a %s order',
    async (status) => {
      await db.order.update({ where: { id: orderId }, data: { status } });
      let release!: () => void;
      let started!: () => void;
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      fetchMock.mockImplementation(async () => {
        started();
        await gate;
        return {
          ok: true,
          json: async () => signedQueryResult({ vnp_TxnRef: txnRef }),
        };
      });
      const reconciliation = worker(db2).reconcilePendingPayments();
      await entered;
      const callback = ipn.handle(query());
      release();
      await Promise.all([reconciliation, callback]);
      await ipn.handle(query());
      if (status === 'PENDING') await assertPaidOnce();
      else {
        expect((await payment()).status).toBe('PAID');
        expect((await order()).status).toBe('CANCELLED');
        expect(await db.refund.count({ where: { paymentId } })).toBe(1);
        expect(await stock()).toBe(100);
        expect(await db.loyaltyTransaction.count({ where: { orderId } })).toBe(
          0,
        );
      }
    },
  );

  it('records late money for a cancelled order and creates exactly one pending refund', async () => {
    await db.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
    });
    await worker().reconcilePendingPayments();
    await ipn.handle(query());
    await worker(db2).reconcilePendingPayments();
    expect((await payment()).status).toBe('PAID');
    expect((await order()).status).toBe('CANCELLED');
    expect(await db.refund.findUnique({ where: { paymentId } })).toMatchObject({
      status: 'PENDING',
      amount: 30000,
    });
    expect(await db.refund.count({ where: { paymentId } })).toBe(1);
    expect(await stock()).toBe(100);
    expect(await db.loyaltyTransaction.count({ where: { orderId } })).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses the existing expired-payment cancellation and refund rule', async () => {
    await db.payment.update({
      where: { id: paymentId },
      data: { expiresAt: past() },
    });
    await worker().reconcilePendingPayments();
    expect((await order()).status).toBe('CANCELLED');
    expect((await payment()).status).toBe('PAID');
    expect(await db.refund.findUnique({ where: { paymentId } })).toMatchObject({
      status: 'PENDING',
    });
    expect(await stock()).toBe(100);
  });

  it('queues a refund when inventory is insufficient', async () => {
    await db.ingredient.update({
      where: { id: ingredientId },
      data: { stock: 0 },
    });
    await worker().reconcilePendingPayments();
    expect((await order()).status).toBe('CANCELLED');
    expect((await payment()).status).toBe('PAID');
    expect(await db.refund.count({ where: { paymentId } })).toBe(1);
    expect(await stock()).toBe(0);
    expect(await db.loyaltyTransaction.count({ where: { orderId } })).toBe(0);
  });

  it('allows only one of two workers to query the same payment', async () => {
    await Promise.all([
      worker().reconcilePendingPayments(),
      worker(db2).reconcilePendingPayments(),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await assertPaidOnce();
    expect((await payment()).reconciliationAttempts).toBe(1);
  });

  it.each([
    { vnp_TmnCode: 'WRONG' },
    { vnp_TxnRef: 'WRONG' },
    { vnp_Amount: '3000001' },
    { vnp_Command: 'refund' },
    { vnp_ResponseCode: '99' },
    { vnp_TransactionStatus: '01' },
    { vnp_TransactionStatus: '' },
    { vnp_TransactionType: '02' },
    { vnp_TransactionType: '03' },
  ])(
    'does not settle an invalid or unresolved signed response %j',
    async (overrides) => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () =>
          signedQueryResult({ vnp_TxnRef: txnRef, ...overrides }),
      });
      await worker().reconcilePendingPayments();
      expect((await payment()).status).toBe('PENDING');
      expect((await order()).status).toBe('PENDING');
      expect(await stock()).toBe(100);
      expect(await db.refund.count({ where: { paymentId } })).toBe(0);
      expect(await db.loyaltyTransaction.count({ where: { orderId } })).toBe(0);
    },
  );

  it.each(['signature', 'timeout', 'network'])(
    'leaves payment pending after %s failure, then permits a later IPN',
    async (failure) => {
      if (failure === 'signature')
        fetchMock.mockResolvedValue({
          ok: true,
          json: async () => ({
            ...signedQueryResult({ vnp_TxnRef: txnRef }),
            vnp_SecureHash: '0'.repeat(128),
          }),
        });
      else fetchMock.mockRejectedValue(new Error(failure));
      await worker().reconcilePendingPayments();
      expect(await payment()).toMatchObject({
        status: 'PENDING',
        reconciliationAttempts: 1,
        reconciliationResult: 'ERROR',
      });
      expect(await db.refund.count({ where: { paymentId } })).toBe(0);
      expect(await stock()).toBe(100);
      await ipn.handle(query());
      await assertPaidOnce();
    },
  );

  it('enforces backoff and the persistent attempt budget across worker restarts', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));
    await worker().reconcilePendingPayments();
    await worker(db2).reconcilePendingPayments();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await db.payment.update({
      where: { id: paymentId },
      data: { reconciliationNextAt: past(), reconciliationAttempts: 11 },
    });
    await worker(db2).reconcilePendingPayments();
    await db.payment.update({
      where: { id: paymentId },
      data: { reconciliationNextAt: past() },
    });
    await worker().reconcilePendingPayments();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await payment()).toMatchObject({
      status: 'PENDING',
      reconciliationAttempts: 12,
    });
  });

  it('recovers an expired claim left by a crashed worker', async () => {
    await db.payment.update({
      where: { id: paymentId },
      data: {
        reconciliationNextAt: past(),
        reconciliationAttempts: 1,
        reconciliationToken: 'crashed-worker',
        reconciliationResult: 'STARTED',
      },
    });
    await worker(db2).reconcilePendingPayments();
    await assertPaidOnce();
    expect(await payment()).toMatchObject({
      reconciliationAttempts: 2,
      reconciliationToken: null,
    });
  });

  it('does not query a recent unexpired checkout', async () => {
    await db.payment.update({
      where: { id: paymentId },
      data: { createdAt: new Date() },
    });
    await worker().reconcilePendingPayments();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refunds a second distinct payment without consuming inventory or awarding points again', async () => {
    const firstRef = txnRef;
    await ipn.handle(query());
    const extra = await db.payment.create({
      data: {
        userId,
        orderId,
        idempotencyKey: crypto.randomUUID(),
        amount: 30000,
        method: 'VNPAY',
        status: 'PENDING',
        providerTxnRef: crypto.randomUUID(),
        createdAt: past(),
        expiresAt: future(),
      },
    });
    txnRef = extra.providerTxnRef!;
    try {
      await worker().reconcilePendingPayments();
      await ipn.handle(query());
      expect((await payment()).status).toBe('PAID');
      expect(
        (await db.payment.findUniqueOrThrow({ where: { id: extra.id } }))
          .status,
      ).toBe('PAID');
      expect(
        await db.refund.findUnique({ where: { paymentId: extra.id } }),
      ).toMatchObject({ status: 'PENDING', amount: 30000 });
      expect(await db.refund.count({ where: { orderId } })).toBe(1);
      expect(await stock()).toBe(80);
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: userId } }))
          .loyaltyPoints,
      ).toBe(3);
      expect(await db.loyaltyTransaction.count({ where: { orderId } })).toBe(1);
    } finally {
      txnRef = firstRef;
      await db.refund.deleteMany({ where: { paymentId: extra.id } });
    }
  });

  it('rolls back payment, inventory and points together if settlement fails, then retries safely', async () => {
    vi.spyOn(inventory, 'deductForPaidOrder').mockImplementation(async (tx) => {
      await tx.ingredient.update({
        where: { id: ingredientId },
        data: { stock: { decrement: 20 } },
      });
      throw new Error('database operation failed');
    });
    await new VnpayReconciliationService(
      db,
      gateway,
      ipn,
    ).reconcilePendingPayments();
    expect((await payment()).status).toBe('PENDING');
    expect((await order()).status).toBe('PENDING');
    expect(await stock()).toBe(100);
    expect(await db.loyaltyTransaction.count({ where: { orderId } })).toBe(0);
    expect(await db.refund.count({ where: { paymentId } })).toBe(0);
    await db.payment.update({
      where: { id: paymentId },
      data: { reconciliationNextAt: past() },
    });
    await worker(db2).reconcilePendingPayments();
    await assertPaidOnce();
  });
});
