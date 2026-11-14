import { PrismaService } from '../../prisma/prisma.service.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VnpayReturnService } from './vnpay-return.service.js';
import { VnpayIpnService } from './vnpay-ipn.service.js';
import { signVnpayParams, type VnpayParams } from './vnpay-signature.js';

describe('VnpayReturnService', () => {
  const prisma = {
    payment: {
      findUnique: vi.fn(),
    },
  };
  const ipn = {
    handle: vi.fn(),
  };

  let service: VnpayReturnService;

  function signedQuery(overrides: Partial<VnpayParams> = {}): VnpayParams {
    const params: VnpayParams = {
      vnp_TmnCode: 'TESTCODE',
      vnp_TxnRef: 'BLRETURN123',
      vnp_Amount: '17280000',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
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

    prisma.payment.findUnique.mockResolvedValue({
      orderId: 10,
      amount: 172_800,
    });
    ipn.handle.mockResolvedValue({ RspCode: '00', Message: 'Confirm Success' });

    service = new VnpayReturnService(
      prisma as unknown as PrismaService,
      ipn as unknown as VnpayIpnService,
    );
  });

  it('redirects a valid response with the related order ID', async () => {
    const result = new URL(await service.buildFrontendRedirect(signedQuery()));

    expect(result.origin).toBe('http://localhost:3000');
    expect(result.pathname).toBe('/payment/vnpay-return');
    expect(result.searchParams.get('valid')).toBe('true');
    expect(result.searchParams.get('orderId')).toBe('10');
    expect(result.searchParams.get('txnRef')).toBe('BLRETURN123');
    expect(ipn.handle).toHaveBeenCalledOnce();
  });

  it('rejects a modified response without querying the database', async () => {
    const query = signedQuery();
    query.vnp_Amount = '1';

    const result = new URL(await service.buildFrontendRedirect(query));

    expect(result.searchParams.get('valid')).toBe('false');
    expect(prisma.payment.findUnique).not.toHaveBeenCalled();
    expect(ipn.handle).not.toHaveBeenCalled();
  });

  it('rejects a signed response when the amount differs from the database', async () => {
    const result = new URL(
      await service.buildFrontendRedirect(
        signedQuery({ vnp_Amount: '17280001' }),
      ),
    );

    expect(result.searchParams.get('valid')).toBe('false');
    expect(result.searchParams.has('orderId')).toBe(false);
    expect(ipn.handle).not.toHaveBeenCalled();
  });

  it('does not expose an unknown transaction reference', async () => {
    prisma.payment.findUnique.mockResolvedValue(null);

    const result = new URL(await service.buildFrontendRedirect(signedQuery()));

    expect(result.searchParams.get('valid')).toBe('false');
    expect(result.searchParams.has('orderId')).toBe(false);
    expect(ipn.handle).not.toHaveBeenCalled();
  });

  it('rejects a callback that the shared settlement path cannot accept', async () => {
    ipn.handle.mockResolvedValue({ RspCode: '99', Message: 'Unknown error' });

    const result = new URL(await service.buildFrontendRedirect(signedQuery()));

    expect(result.searchParams.get('valid')).toBe('false');
    expect(result.searchParams.has('orderId')).toBe(false);
  });
});
