import { OrderStatus, PaymentMethod } from '../../generated/prisma/client.js';
import { InventoryService } from '../../inventory/inventory.service.js';
import { LoyaltyService } from '../../loyalty/loyalty.service.js';
import { OrderStateService } from '../../orders/order-state.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VnpayIpnService } from './vnpay-ipn.service.js';
import { signVnpayParams, type VnpayParams } from './vnpay-signature.js';

describe('VnpayIpnService', () => {
  const transaction = {
    payment: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    order: {
      findUnique: vi.fn(),
    },
  };

  const prisma = {
    $transaction: vi.fn((callback: (tx: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  };

  const orderState = {
    transition: vi.fn(),
  };

  const inventory = {
    deductForPaidOrder: vi.fn(),
  };

  const loyalty = {
    awardPointsForPaidOrder: vi.fn(),
  };

  let service: VnpayIpnService;

  function signedQuery(overrides: Partial<VnpayParams> = {}): VnpayParams {
    const params: VnpayParams = {
      vnp_TmnCode: 'TESTCODE',
      vnp_TxnRef: 'BLTEST123',
      vnp_Amount: '17280000',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
      vnp_TransactionNo: '14567890',
      vnp_PayDate: '20261104135000',
      vnp_BankCode: 'NCB',
      ...overrides,
    };

    return {
      ...params,
      vnp_SecureHash: signVnpayParams(params, 'test-secret'),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();

    process.env.VNPAY_TMN_CODE = 'TESTCODE';
    process.env.VNPAY_HASH_SECRET = 'test-secret';
    process.env.VNPAY_PAYMENT_URL =
      'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
    process.env.VNPAY_RETURN_URL = 'https://example.test/payments/vnpay/return';
    process.env.FRONTEND_URL = 'http://localhost:3000';

    transaction.payment.findUnique.mockResolvedValue({
      id: 5,
      userId: 7,
      orderId: 10,
      amount: 172_800,
      status: OrderStatus.PENDING,
    });

    transaction.order.findUnique.mockResolvedValue({
      id: 10,
      userId: 7,
      total: 172_800,
      status: OrderStatus.PENDING,
    });

    orderState.transition.mockImplementation(
      (orderId: number, status: OrderStatus) =>
        Promise.resolve({
          id: orderId,
          userId: 7,
          total: 172_800,
          status,
        }),
    );

    transaction.payment.update.mockResolvedValue({});
    inventory.deductForPaidOrder.mockResolvedValue([]);
    loyalty.awardPointsForPaidOrder.mockResolvedValue(17);

    service = new VnpayIpnService(
      prisma as unknown as PrismaService,
      orderState as unknown as OrderStateService,
      inventory as unknown as InventoryService,
      loyalty as unknown as LoyaltyService,
    );
  });

  it('rejects a modified callback before accessing the database', async () => {
    const query = signedQuery();
    query.vnp_Amount = '17280001';

    await expect(service.handle(query)).resolves.toEqual({
      RspCode: '97',
      Message: 'Invalid Checksum',
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns 01 when the transaction reference does not exist', async () => {
    transaction.payment.findUnique.mockResolvedValue(null);

    await expect(service.handle(signedQuery())).resolves.toEqual({
      RspCode: '01',
      Message: 'Order not Found',
    });
  });

  it('returns 04 when the callback amount differs from the database', async () => {
    transaction.payment.findUnique.mockResolvedValue({
      id: 5,
      userId: 7,
      orderId: 10,
      amount: 100_000,
      status: OrderStatus.PENDING,
    });

    await expect(service.handle(signedQuery())).resolves.toEqual({
      RspCode: '04',
      Message: 'Invalid Amount',
    });

    expect(inventory.deductForPaidOrder).not.toHaveBeenCalled();
  });

  it('confirms success in one transaction', async () => {
    await expect(service.handle(signedQuery())).resolves.toEqual({
      RspCode: '00',
      Message: 'Confirm Success',
    });

    expect(inventory.deductForPaidOrder).toHaveBeenCalledWith(transaction, 10);

    expect(orderState.transition).toHaveBeenCalledWith(
      10,
      OrderStatus.PAID,
      transaction,
      expect.objectContaining({
        paymentMethod: PaymentMethod.VNPAY,
        paidAt: expect.any(Date),
        inventoryDeducted: true,
      }),
    );

    expect(loyalty.awardPointsForPaidOrder).toHaveBeenCalledTimes(1);

    expect(transaction.payment.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: expect.objectContaining({
        status: OrderStatus.PAID,
        paidAt: expect.any(Date),
        providerTransactionNo: '14567890',
        providerResponseCode: '00',
        providerTransactionStatus: '00',
        providerPayDate: '20261104135000',
        providerBankCode: 'NCB',
      }),
    });
  });

  it('records a failed payment without changing inventory or points', async () => {
    const query = signedQuery({
      vnp_ResponseCode: '24',
      vnp_TransactionStatus: '02',
    });

    await expect(service.handle(query)).resolves.toEqual({
      RspCode: '00',
      Message: 'Confirm Success',
    });

    expect(orderState.transition).toHaveBeenCalledWith(
      10,
      OrderStatus.PAYMENT_FAILED,
      transaction,
      {
        paymentMethod: PaymentMethod.VNPAY,
        paidAt: null,
      },
    );

    expect(inventory.deductForPaidOrder).not.toHaveBeenCalled();
    expect(loyalty.awardPointsForPaidOrder).not.toHaveBeenCalled();

    expect(transaction.payment.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: expect.objectContaining({
        status: OrderStatus.PAYMENT_FAILED,
        paidAt: null,
        providerResponseCode: '24',
        providerTransactionStatus: '02',
      }),
    });
  });

  it('returns 02 for a duplicate callback without applying side effects', async () => {
    transaction.payment.findUnique.mockResolvedValue({
      id: 5,
      userId: 7,
      orderId: 10,
      amount: 172_800,
      status: OrderStatus.PAID,
    });

    await expect(service.handle(signedQuery())).resolves.toEqual({
      RspCode: '02',
      Message: 'Order already confirmed',
    });

    expect(inventory.deductForPaidOrder).not.toHaveBeenCalled();
    expect(loyalty.awardPointsForPaidOrder).not.toHaveBeenCalled();
    expect(transaction.payment.update).not.toHaveBeenCalled();
  });
});
