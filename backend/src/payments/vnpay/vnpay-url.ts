import type { VnpayConfig } from './vnpay-config.js';
import {
  buildVnpayQuery,
  signVnpayParams,
  type VnpayParams,
} from './vnpay-signature.js';

const VIETNAM_TIME_OFFSET_MS = 7 * 60 * 60 * 1000;

export interface BuildVnpayUrlInput {
  orderId: number;
  amount: number;
  txnRef: string;
  ipAddress: string;
  locale: 'vn' | 'en';
  createdAt: Date;
  expiresAt: Date;
}

export function formatVnpayDate(date: Date): string {
  const vietnamTime = new Date(date.getTime() + VIETNAM_TIME_OFFSET_MS);
  const pad = (value: number) => value.toString().padStart(2, '0');

  return [
    vietnamTime.getUTCFullYear(),
    pad(vietnamTime.getUTCMonth() + 1),
    pad(vietnamTime.getUTCDate()),
    pad(vietnamTime.getUTCHours()),
    pad(vietnamTime.getUTCMinutes()),
    pad(vietnamTime.getUTCSeconds()),
  ].join('');
}

export function buildVnpayPaymentUrl(
  input: BuildVnpayUrlInput,
  config: VnpayConfig,
): string {
  const params: VnpayParams = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: config.tmnCode,
    vnp_Amount: String(input.amount * 100),
    vnp_CurrCode: 'VND',
    vnp_TxnRef: input.txnRef,
    vnp_OrderInfo: `Thanh toan don hang ${input.orderId}`,
    vnp_OrderType: 'other',
    vnp_Locale: input.locale,
    vnp_ReturnUrl: config.returnUrl,
    vnp_IpAddr: input.ipAddress,
    vnp_CreateDate: formatVnpayDate(input.createdAt),
    vnp_ExpireDate: formatVnpayDate(input.expiresAt),
  };

  const query = buildVnpayQuery(params);
  const signature = signVnpayParams(params, config.hashSecret);
  const separator = config.paymentUrl.includes('?') ? '&' : '?';

  return `${config.paymentUrl}${separator}${query}&vnp_SecureHash=${signature}`;
}
