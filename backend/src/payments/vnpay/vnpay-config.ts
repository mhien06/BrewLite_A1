export interface VnpayConfig {
  tmnCode: string;
  hashSecret: string;
  paymentUrl: string;
  returnUrl: string;
  frontendUrl: string;
  apiUrl: string;
  paymentExpiryMinutes: number;
}

function requireEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} chưa được cấu hình.`);
  }

  return value;
}

function validateUrl(name: string, value: string): string {
  try {
    return new URL(value).toString();
  } catch {
    throw new Error(`${name} không phải URL hợp lệ.`);
  }
}

function readPositiveInteger(name: string, defaultValue: number): number {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    return defaultValue;
  }

  const value = Number(rawValue);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} phải là số nguyên dương.`);
  }

  return value;
}

export function getVnpayConfig(): VnpayConfig {
  const paymentUrl =
    process.env.VNPAY_PAYMENT_URL?.trim() ||
    'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';

  const apiUrl =
    process.env.VNPAY_API_URL?.trim() ||
    'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction';

  const frontendUrl =
    process.env.FRONTEND_URL?.trim() || 'http://localhost:3000';

  return {
    tmnCode: requireEnvironmentValue('VNPAY_TMN_CODE'),
    hashSecret: requireEnvironmentValue('VNPAY_HASH_SECRET'),
    paymentUrl: validateUrl('VNPAY_PAYMENT_URL', paymentUrl),
    returnUrl: validateUrl(
      'VNPAY_RETURN_URL',
      requireEnvironmentValue('VNPAY_RETURN_URL'),
    ),
    frontendUrl: validateUrl('FRONTEND_URL', frontendUrl),
    apiUrl: validateUrl('VNPAY_API_URL', apiUrl),
    paymentExpiryMinutes: readPositiveInteger(
      'VNPAY_PAYMENT_EXPIRY_MINUTES',
      15,
    ),
  };
}
