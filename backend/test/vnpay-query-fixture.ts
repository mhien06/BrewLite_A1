import {
  signVnpayData,
  type VnpayParams,
} from '../src/payments/vnpay/vnpay-signature.js';

export function signedQueryResult(overrides: Partial<VnpayParams> = {}): VnpayParams {
  const params: VnpayParams = {
    vnp_ResponseId: 'test-query-response',
    vnp_Command: 'querydr',
    vnp_ResponseCode: '00',
    vnp_Message: 'Success',
    vnp_TmnCode: 'TESTCODE',
    vnp_TxnRef: 'BLTEST123',
    vnp_Amount: '3000000',
    vnp_BankCode: 'NCB',
    vnp_PayDate: '20261113100000',
    vnp_TransactionNo: '123456',
    vnp_TransactionType: '01',
    vnp_TransactionStatus: '00',
    vnp_OrderInfo: 'Test query',
    ...overrides,
  };
  const fields = [
    'vnp_ResponseId',
    'vnp_Command',
    'vnp_ResponseCode',
    'vnp_Message',
    'vnp_TmnCode',
    'vnp_TxnRef',
    'vnp_Amount',
    'vnp_BankCode',
    'vnp_PayDate',
    'vnp_TransactionNo',
    'vnp_TransactionType',
    'vnp_TransactionStatus',
    'vnp_OrderInfo',
    'vnp_PromotionCode',
    'vnp_PromotionAmount',
  ];
  return {
    ...params,
    vnp_SecureHash: signVnpayData(
      fields.map((f) => params[f] ?? '').join('|'),
      'test-secret',
    ),
  };
}
