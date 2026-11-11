import {
  signVnpayData,
  verifyVnpayDataSignature,
  type VnpayParams,
} from './vnpay-signature.js';

const QUERY_REQUEST_FIELDS = [
  'vnp_RequestId',
  'vnp_Version',
  'vnp_Command',
  'vnp_TmnCode',
  'vnp_TxnRef',
  'vnp_TransactionDate',
  'vnp_CreateDate',
  'vnp_IpAddr',
  'vnp_OrderInfo',
] as const;

const REFUND_REQUEST_FIELDS = [
  'vnp_RequestId',
  'vnp_Version',
  'vnp_Command',
  'vnp_TmnCode',
  'vnp_TransactionType',
  'vnp_TxnRef',
  'vnp_Amount',
  'vnp_TransactionNo',
  'vnp_TransactionDate',
  'vnp_CreateBy',
  'vnp_CreateDate',
  'vnp_IpAddr',
  'vnp_OrderInfo',
] as const;

const QUERY_RESPONSE_FIELDS = [
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
] as const;

const REFUND_RESPONSE_FIELDS = [
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
] as const;

export function buildVnpayPipeData(
  params: VnpayParams,
  fields: readonly string[],
): string {
  return fields.map((field) => params[field] ?? '').join('|');
}

export function signVnpayQueryRequest(
  params: VnpayParams,
  hashSecret: string,
): string {
  return signVnpayData(
    buildVnpayPipeData(params, QUERY_REQUEST_FIELDS),
    hashSecret,
  );
}

export function signVnpayRefundRequest(
  params: VnpayParams,
  hashSecret: string,
): string {
  return signVnpayData(
    buildVnpayPipeData(params, REFUND_REQUEST_FIELDS),
    hashSecret,
  );
}

export function verifyVnpayQueryResponse(
  params: VnpayParams,
  hashSecret: string,
): boolean {
  return verifyVnpayDataSignature(
    buildVnpayPipeData(params, QUERY_RESPONSE_FIELDS),
    params.vnp_SecureHash,
    hashSecret,
  );
}

export function verifyVnpayRefundResponse(
  params: VnpayParams,
  hashSecret: string,
): boolean {
  return verifyVnpayDataSignature(
    buildVnpayPipeData(params, REFUND_RESPONSE_FIELDS),
    params.vnp_SecureHash,
    hashSecret,
  );
}
