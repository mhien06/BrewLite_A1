import { createHmac, timingSafeEqual } from 'node:crypto';

export type VnpayParams = Record<string, string>;

function encodeVnpayValue(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, '+');
}

export function buildVnpayQuery(params: VnpayParams): string {
  return Object.entries(params)
    .filter(
      ([key, value]) =>
        key !== 'vnp_SecureHash' &&
        key !== 'vnp_SecureHashType' &&
        value.length > 0,
    )
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(
      ([key, value]) => `${encodeVnpayValue(key)}=${encodeVnpayValue(value)}`,
    )
    .join('&');
}

export function signVnpayData(data: string, hashSecret: string): string {
  return createHmac('sha512', hashSecret).update(data, 'utf8').digest('hex');
}

export function verifyVnpayDataSignature(
  data: string,
  receivedHash: string | undefined,
  hashSecret: string,
): boolean {
  if (!receivedHash || !/^[0-9a-fA-F]{128}$/.test(receivedHash)) {
    return false;
  }

  const expectedBuffer = Buffer.from(signVnpayData(data, hashSecret), 'hex');
  const receivedBuffer = Buffer.from(receivedHash, 'hex');

  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export function signVnpayParams(
  params: VnpayParams,
  hashSecret: string,
): string {
  return signVnpayData(buildVnpayQuery(params), hashSecret);
}

export function verifyVnpaySignature(
  params: VnpayParams,
  hashSecret: string,
): boolean {
  return verifyVnpayDataSignature(
    buildVnpayQuery(params),
    params.vnp_SecureHash,
    hashSecret,
  );
}

export function normalizeVnpayQuery(
  query: Record<string, unknown>,
): VnpayParams | null {
  const result: VnpayParams = {};

  for (const [key, value] of Object.entries(query)) {
    if (typeof value !== 'string') {
      return null;
    }

    result[key] = value;
  }

  return result;
}
