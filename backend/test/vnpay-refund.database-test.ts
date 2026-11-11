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

describe('VNPay refund queue and audit history on PostgreSQL', () => {
  const db = new PrismaService();
  const db2 = new PrismaService();
  let userId: number;
  let orderId: number;
  let paymentId: number;
  let refundId: number;
  let txnRef: string;

  const successfulRefund = {
    vnp_Command: 'refund',
    vnp_ResponseId: 'refund-response-integration',
    vnp_Message: 'Refund successful',
    vnp_TransactionNo: '987654321',
    vnp_PayDate: '20261111110000',
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

  async function refund() {
    return db.refund.findUniqueOrThrow({
      where: { id: refundId },
      include: { attempts: { orderBy: { attemptNumber: 'asc' } } },
    });
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
        },
      })
    ).id;
    refundId = (
      await db.refund.create({
        data: {
          paymentId,
          orderId,
          amount: 30000,
          reason: 'Integration test',
          status: 'PENDING',
          requestedAt: new Date(),
        },
      })
    ).id;
  });

  afterEach(async () => {
    await db.refund.deleteMany({ where: { id: refundId } });
    await db.payment.deleteMany({ where: { userId } });
    await db.order.deleteMany({ where: { userId } });
    await db.user.delete({ where: { id: userId } });
  });

  afterAll(async () => {
    await db.$disconnect();
    await db2.$disconnect();
  });

  it('allows only one worker to submit and records a complete attempt', async () => {
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
    const result = await refund();
    expect(result).toMatchObject({
      status: 'SUCCEEDED',
      amount: 30000,
      completedAt: expect.any(Date),
      attempts: [
        {
          attemptNumber: 1,
          type: 'REFUND',
          status: 'CONFIRMED',
          responseId: 'refund-response-integration',
          responseCode: '00',
          responseMessage: 'Refund successful',
          responseTransactionNo: '987654321',
          responsePayDate: '20261111110000',
          responseTransactionStatus: '00',
        },
      ],
    });
  });

  it('does not mistake QueryDR success of the original payment for a refund', async () => {
    const checkedAt = new Date(Date.now() - 120000);
    await db.refund.update({
      where: { id: refundId },
      data: { status: 'NEEDS_REVIEW', requestId: 'previous-refund-request', checkedAt },
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
    const result = await refund();
    expect(result.status).toBe('NEEDS_REVIEW');
    expect(result.completedAt).toBeNull();
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({
      type: 'QUERY',
      status: 'AMBIGUOUS',
      responseCode: '00',
      responseTransactionStatus: '00',
    });
  });

  it('preserves the first rejected attempt when staff queues a retry', async () => {
    const adapter = gateway();
    adapter.refundTransaction.mockResolvedValue({
      vnp_Command: 'refund',
      vnp_TransactionType: '02',
      vnp_ResponseCode: '91',
      vnp_TransactionStatus: '09',
    });
    await service(db, adapter).processRefunds();
    expect((await refund()).status).toBe('FAILED');

    await service(db, adapter).retryRejectedRefund(refundId, userId);
    const queued = await refund();
    expect(queued.status).toBe('PENDING');
    expect(queued.attempts).toHaveLength(1);
    expect(queued.attempts[0].status).toBe('REJECTED');
  });
});
