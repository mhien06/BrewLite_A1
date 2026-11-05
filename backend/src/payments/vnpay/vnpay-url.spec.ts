import { describe, expect, it } from 'vitest';
import type { VnpayConfig } from './vnpay-config.js';
import {
  normalizeVnpayQuery,
  verifyVnpaySignature,
} from './vnpay-signature.js';
import { buildVnpayPaymentUrl, formatVnpayDate } from './vnpay-url.js';

describe('VNPAY payment URL', () => {
  const config: VnpayConfig = {
    tmnCode: 'TESTCODE',
    hashSecret: 'test-secret',
    paymentUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    returnUrl: 'https://example.test/payments/vnpay/return',
    frontendUrl: 'http://localhost:3000/',
    apiUrl: 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
    paymentExpiryMinutes: 15,
  };

  it('formats time using Vietnam UTC+7', () => {
    expect(formatVnpayDate(new Date('2026-11-04T06:30:44.000Z'))).toBe(
      '20261104133044',
    );
  });

  it('uses the database amount and creates a valid signature', () => {
    const paymentUrl = buildVnpayPaymentUrl(
      {
        orderId: 1,
        amount: 172_800,
        txnRef: 'BL123',
        ipAddress: '127.0.0.1',
        locale: 'vn',
        createdAt: new Date('2026-11-04T06:30:44.000Z'),
        expiresAt: new Date('2026-11-04T06:45:44.000Z'),
      },
      config,
    );

    const url = new URL(paymentUrl);
    const params = normalizeVnpayQuery(
      Object.fromEntries(url.searchParams.entries()),
    );

    expect(params).not.toBeNull();
    expect(params?.vnp_Amount).toBe('17280000');
    expect(params?.vnp_TxnRef).toBe('BL123');
    expect(params?.vnp_CreateDate).toBe('20261104133044');
    expect(params?.vnp_ExpireDate).toBe('20261104134544');
    expect(verifyVnpaySignature(params!, config.hashSecret)).toBe(true);
  });
});
