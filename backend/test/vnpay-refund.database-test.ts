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
import { VnpayRefundService } from '../src/payments/vnpay/vnpay-refund.service.js';
import { VnpayTransactionApiService } from '../src/payments/vnpay/vnpay-transaction-api.service.js';

describe('VNPay refund queue on PostgreSQL', () => {
  const db = new PrismaService();
  const db2 = new PrismaService();
  let userId: number;
  let orderId: number;
  let paymentId: number;
  let txnRef: string;

  const successfulRefund = {
    vnp_Command: 'refund',
    vnp_TransactionType: '02',
    vnp_ResponseCode: '00',
    vnp_TransactionStatus: '00',
  };

  function gateway() {
    return {
      refundTransaction: vi.fn().mockResolvedValue(successfulRefund),
      queryTransaction: vi.fn(),
    };
  }

  function service(
    database: PrismaService,
    adapter: ReturnType<typeof gateway>,
  ) {
    return new VnpayRefundService(
      database,
      adapter as unknown as VnpayTransactionApiService,
    );
  }

  async function payment() {
    return db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  }

  beforeAll(async () => {
    await db.$connect();
    await db2.$connect();
  });

  beforeEach(async () => {
    txnRef = crypto.randomUUID();
    userId = (
      await db.user.create({
        data: {
          email: `${txnRef}@refund.test`,
          passwordHash: 'test-only',
        },
      })
    ).id;
    orderId = (
      await db.order.create({
        data: {
          userId,
          subtotal: 30000,
          total: 30000,
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
          status: 'PAID',
          providerTxnRef: txnRef,
          providerTransactionNo: '123456',
          providerPayDate: '20261111100000',
          refundStatus: 'PENDING',
          refundRequestedAt: new Date(),
          refundAmount: 30000,
          refundReason: 'Integration test',
        },
      })
    ).id;
  });

  afterEach(async () => {
    await db.payment.deleteMany({ where: { userId } });
    await db.order.deleteMany({ where: { userId } });
    await db.user.delete({ where: { id: userId } });
  });

  afterAll(async () => {
    await db.$disconnect();
    await db2.$disconnect();
  });

  it('allows only one worker to submit a full refund for a payment', async () => {
    const firstGateway = gateway();
    const secondGateway = gateway();

    await Promise.all([
      service(db, firstGateway).processRefunds(),
      service(db2, secondGateway).processRefunds(),
    ]);

    expect(
      firstGateway.refundTransaction.mock.calls.length +
        secondGateway.refundTransaction.mock.calls.length,
    ).toBe(1);
    expect(await payment()).toMatchObject({
      refundStatus: 'SUCCEEDED',
      refundAmount: 30000,
      refundResponseCode: '00',
      refundTransactionStatus: '00',
    });
    expect((await payment()).refundCompletedAt).toBeInstanceOf(Date);
  });

  it('does not mistake a successful QueryDR of the original payment for a refund', async () => {
    const checkedAt = new Date(Date.now() - 120000);
    await db.payment.update({
      where: { id: paymentId },
      data: {
        refundStatus: 'NEEDS_REVIEW',
        refundRequestId: `request-${txnRef}`,
        refundCheckedAt: checkedAt,
      },
    });

    const adapter = gateway();
    adapter.queryTransaction.mockResolvedValue({
      vnp_Command: 'querydr',
      vnp_TransactionType: '01',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
    });

    await service(db, adapter).processRefunds();

    expect(adapter.refundTransaction).not.toHaveBeenCalled();
    expect(adapter.queryTransaction).toHaveBeenCalledTimes(1);
    expect(await payment()).toMatchObject({
      refundStatus: 'NEEDS_REVIEW',
      refundResponseCode: '00',
      refundTransactionStatus: '00',
    });
    expect((await payment()).refundCompletedAt).toBeNull();
  });
});
