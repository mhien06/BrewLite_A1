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
import { VnpayRefundClient } from '../src/payments/vnpay/vnpay-refund.client.js';

describe('VNPay refund queue and audit history on PostgreSQL', () => {
  const db = new PrismaService();
  const db2 = new PrismaService();
  let userId: number;
  let orderId: number;
  let paymentId: number;
  let refundId: number;
  let txnRef: string;

  const successfulRefund = {
    outcome: 'COMPLETED' as const,
    responseId: 'refund-response-integration',
    message: 'Refund successful',
    transactionNo: '987654321',
    payDate: '20261111110000',
    responseCode: '00',
    transactionStatus: '00',
  };

  function gateway() {
    return {
      requestRefund: vi.fn().mockResolvedValue(successfulRefund),
      queryTransaction: vi.fn(),
    };
  }

  function service(
    database: PrismaService,
    adapter: ReturnType<typeof gateway>,
  ) {
    return new VnpayRefundService(
      database,
      adapter as unknown as VnpayRefundClient,
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
          source: 'SYSTEM',
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
      firstGateway.requestRefund.mock.calls.length +
        secondGateway.requestRefund.mock.calls.length,
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

  it('safely requeues after QueryDR confirms only the original payment succeeded', async () => {
    const firstCheck = new Date();
    const checkedAt = new Date(firstCheck.getTime() - 120000);
    await db.refund.update({
      where: { id: refundId },
      data: {
        status: 'NEEDS_REVIEW',
        requestId: 'previous-refund-request',
        checkedAt,
      },
    });

    const adapter = gateway();
    adapter.queryTransaction.mockResolvedValue({
      outcome: 'NOT_STARTED',
      responseId: 'query-response-integration',
      responseCode: '00',
      transactionStatus: '00',
      transactionNo: '123456',
      payDate: '20261111100000',
      message: 'Original payment succeeded; no refund exists.',
    });

    await service(db, adapter).processRefunds(firstCheck);

    expect(adapter.requestRefund).not.toHaveBeenCalled();
    expect(adapter.queryTransaction).toHaveBeenCalledTimes(1);
    const queued = await refund();
    expect(queued.status).toBe('PENDING');
    expect(queued.completedAt).toBeNull();
    expect(queued.attempts).toHaveLength(1);
    expect(queued.attempts[0]).toMatchObject({
      type: 'QUERY',
      status: 'CONFIRMED',
      responseCode: '00',
      responseTransactionStatus: '00',
    });

    await service(db, adapter).processRefunds(
      new Date(firstCheck.getTime() + 61_000),
    );
    expect(adapter.requestRefund).toHaveBeenCalledTimes(1);
    expect((await refund()).status).toBe('SUCCEEDED');
  });

  it('preserves rejected history and retries automatically only after QueryDR confirms no refund', async () => {
    const adapter = gateway();
    adapter.requestRefund.mockResolvedValueOnce({
      outcome: 'REJECTED',
      responseId: 'rejected-response',
      responseCode: '95',
      transactionStatus: '09',
      transactionNo: '123456',
      payDate: '20261111100000',
      message: 'Refund rejected',
    });
    adapter.queryTransaction.mockResolvedValue({
      outcome: 'NOT_STARTED',
      responseId: 'query-response-integration',
      responseCode: '00',
      transactionStatus: '00',
      transactionNo: '123456',
      payDate: '20261111100000',
      message: 'Original payment succeeded; no refund exists.',
    });
    const firstCheck = new Date();

    await service(db, adapter).processRefunds(firstCheck);
    const rejected = await refund();
    expect(rejected.status).toBe('NEEDS_REVIEW');
    expect(rejected.attempts).toHaveLength(1);
    expect(rejected.attempts[0].status).toBe('REJECTED');

    await service(db, adapter).processRefunds(
      new Date(firstCheck.getTime() + 61_000),
    );
    const queued = await refund();
    expect(queued.status).toBe('PENDING');
    expect(queued.attempts).toHaveLength(2);
    expect(queued.attempts[1]).toMatchObject({
      type: 'QUERY',
      status: 'CONFIRMED',
    });

    await service(db, adapter).processRefunds(
      new Date(firstCheck.getTime() + 122_000),
    );
    const completed = await refund();
    expect(completed.status).toBe('SUCCEEDED');
    expect(completed.attempts).toHaveLength(3);
    expect(completed.attempts[2]).toMatchObject({
      attemptNumber: 3,
      type: 'REFUND',
      status: 'CONFIRMED',
      initiatedById: null,
    });
    expect(adapter.queryTransaction).toHaveBeenCalledTimes(1);
    expect(adapter.requestRefund).toHaveBeenCalledTimes(2);
  });
});
