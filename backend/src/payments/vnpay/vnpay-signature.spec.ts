import { describe, expect, it } from 'vitest';
import {
  buildVnpayQuery,
  signVnpayParams,
  verifyVnpaySignature,
  type VnpayParams,
} from './vnpay-signature.js';

describe('VNPAY signature', () => {
  const params: VnpayParams = {
    vnp_Amount: '17280000',
    vnp_Command: 'pay',
    vnp_CurrCode: 'VND',
    vnp_OrderInfo: 'Thanh toan don hang 1',
    vnp_TmnCode: 'TESTCODE',
    vnp_TxnRef: 'BL123',
    vnp_Version: '2.1.0',
  };

  const expectedHash =
    'bf25886cf516e3653dcd3a60efcb021f78652dcb6967e0207232f50018c4f2e41d5f0577df4b00033663ce4ff7935dcb46ed8c80f6e156a17f2aaa0c614611d1';

  it('sorts and encodes parameters in VNPAY format', () => {
    expect(buildVnpayQuery(params)).toBe(
      'vnp_Amount=17280000&vnp_Command=pay&vnp_CurrCode=VND&vnp_OrderInfo=Thanh+toan+don+hang+1&vnp_TmnCode=TESTCODE&vnp_TxnRef=BL123&vnp_Version=2.1.0',
    );
  });

  it('creates the expected HMAC-SHA512 signature', () => {
    expect(signVnpayParams(params, 'test-secret')).toBe(expectedHash);
  });

  it('accepts valid data and rejects modified data', () => {
    const signed = { ...params, vnp_SecureHash: expectedHash };

    expect(verifyVnpaySignature(signed, 'test-secret')).toBe(true);
    expect(
      verifyVnpaySignature(
        { ...signed, vnp_Amount: '17280001' },
        'test-secret',
      ),
    ).toBe(false);
  });
});
