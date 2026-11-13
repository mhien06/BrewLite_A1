import { describe, expect, it } from 'vitest';
import type { VnpayParams } from './vnpay-signature.js';
import {
  signVnpayQueryRequest,
  signVnpayRefundRequest,
  verifyVnpayQueryResponse,
  verifyVnpayRefundResponse,
} from './vnpay-transaction-signature.js';

describe('VNPAY transaction API signature', () => {
  const hashSecret = 'test-secret';

  it('signs a QueryDR request using the documented field order', () => {
    const params: VnpayParams = {
      vnp_RequestId: 'REQ123',
      vnp_Version: '2.1.0',
      vnp_Command: 'querydr',
      vnp_TmnCode: 'TESTCODE',
      vnp_TxnRef: 'BL123',
      vnp_TransactionDate: '20261104133044',
      vnp_CreateDate: '20261104140000',
      vnp_IpAddr: '127.0.0.1',
      vnp_OrderInfo: 'Truy van don hang 1',
    };

    expect(signVnpayQueryRequest(params, hashSecret)).toBe(
      '85c2dbe429354feff3e1f3864b8f6aa3930ea24300df5808d311c7512f4f587cc79031db29379e9bc0f9bbafe0ce80ec174795183e36672b6038a18e9b0a5b7b',
    );
  });

  it('signs a refund request using the documented field order', () => {
    const params: VnpayParams = {
      vnp_RequestId: 'REQ456',
      vnp_Version: '2.1.0',
      vnp_Command: 'refund',
      vnp_TmnCode: 'TESTCODE',
      vnp_TransactionType: '02',
      vnp_TxnRef: 'BL123',
      vnp_Amount: '17280000',
      vnp_TransactionNo: '123456',
      vnp_TransactionDate: '20261104133044',
      vnp_CreateBy: 'staff@gmail.com',
      vnp_CreateDate: '20261104140500',
      vnp_IpAddr: '127.0.0.1',
      vnp_OrderInfo: 'Hoan tien don hang 1',
    };

    expect(signVnpayRefundRequest(params, hashSecret)).toBe(
      '7581fc8a551d00fed63e6e65445109c32f189fce0a5e72fcb2ac9dffb5bc06dc8395ed2e143d221a15894a961ff4646c8b1e845c7cb600a7ac7ec76e426e276a',
    );
  });

  it('verifies QueryDR responses and rejects modified data', () => {
    const params: VnpayParams = {
      vnp_ResponseId: 'RESP123',
      vnp_Command: 'querydr',
      vnp_ResponseCode: '00',
      vnp_Message: 'Success',
      vnp_TmnCode: 'TESTCODE',
      vnp_TxnRef: 'BL123',
      vnp_Amount: '17280000',
      vnp_BankCode: 'NCB',
      vnp_PayDate: '20261104133500',
      vnp_TransactionNo: '123456',
      vnp_TransactionType: '01',
      vnp_TransactionStatus: '00',
      vnp_OrderInfo: 'Truy van don hang 1',
      vnp_SecureHash:
        '535a1172fe49a72724ae9dc0964a328db23b384333e8f3c53a24d4af097b9053d0d40fcb8582c5f71f3ba9c592e9b278f83d15c91f9f9fed7b851375eb86092c',
    };

    expect(verifyVnpayQueryResponse(params, hashSecret)).toBe(true);
    expect(
      verifyVnpayQueryResponse(
        { ...params, vnp_Amount: '17280001' },
        hashSecret,
      ),
    ).toBe(false);
  });

  it('verifies refund responses and rejects modified data', () => {
    const params: VnpayParams = {
      vnp_ResponseId: 'RESP456',
      vnp_Command: 'refund',
      vnp_ResponseCode: '00',
      vnp_Message: 'Success',
      vnp_TmnCode: 'TESTCODE',
      vnp_TxnRef: 'BL123',
      vnp_Amount: '17280000',
      vnp_BankCode: 'NCB',
      vnp_PayDate: '20261104141000',
      vnp_TransactionNo: '654321',
      vnp_TransactionType: '02',
      vnp_TransactionStatus: '00',
      vnp_OrderInfo: 'Hoan tien don hang 1',
      vnp_SecureHash:
        'd229737ba927fc59b565e1d4fbced6d2d8f9cf4691082ee4e2514a7afdfa92bb48c716106d39441bf4f17b479c6905323b958f08716631b2a7312dab5ffdfa6c',
    };

    expect(verifyVnpayRefundResponse(params, hashSecret)).toBe(true);
    expect(
      verifyVnpayRefundResponse(
        { ...params, vnp_TransactionStatus: '09' },
        hashSecret,
      ),
    ).toBe(false);
  });
});
