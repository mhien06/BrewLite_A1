
import { Injectable, Logger } from '@nestjs/common';
import { getVnpayConfig, type VnpayConfig } from './vnpay-config.js';
import { signVnpayData, verifyVnpayDataSignature } from './vnpay-signature.js';

const VNPAY_VERSION = '2.1.0';
const FULL_REFUND_TYPE = '02';
const DEFAULT_TIMEOUT_MS = 15_000;
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Kết quả đã phân loại của một phản hồi VNPAY đã được xác minh chữ ký.
 * - ACCEPTED: VNPAY đã tiếp nhận, CHƯA phải tiền đã hoàn xong.
 * - COMPLETED: VNPAY xác nhận giao dịch hoàn đã hoàn tất.
 * - REJECTED: VNPAY từ chối chắc chắn, không có tiền nào được hoàn.
 * - ORIGINAL_PAYMENT_CONFIRMED: QueryDR xác nhận giao dịch gốc, không chứng minh
 *   rằng chưa có yêu cầu hoàn tiền riêng.
 * - UNKNOWN: chưa đủ cơ sở kết luận; giữ trạng thái đối soát và tiếp tục QueryDR.
 */
export type VnpayRefundOutcome =
  | 'ACCEPTED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'ORIGINAL_PAYMENT_CONFIRMED'
  | 'UNKNOWN';

export interface VnpayRefundResult {
  outcome: VnpayRefundOutcome;
  responseId: string;
  responseCode: string;
  transactionStatus: string;
  transactionNo: string;
  payDate: string;
  message: string;
}

export type VnpayUncertainReason =
  | 'TIMEOUT'
  | 'NETWORK'
  | 'HTTP_ERROR'
  | 'INVALID_RESPONSE'
  | 'INVALID_SIGNATURE';

/** Không biết VNPAY đã nhận yêu cầu hay chưa: tuyệt đối không coi là thất bại. */
export class VnpayUncertainOutcomeError extends Error {
  constructor(
    readonly reason: VnpayUncertainReason,
    message: string,
  ) {
    super(message);
    this.name = 'VnpayUncertainOutcomeError';
  }
}

export interface VnpayRefundRequestInput {
  requestId: string;
  txnRef: string;
  amount: number;
  transactionNo?: string | null;
  transactionDate: string;
  createdBy: string;
  orderInfo: string;
  ipAddress: string;
  now?: Date;
}

export interface VnpayQueryInput {
  requestId: string;
  txnRef: string;
  expectedAmount: number;
  transactionDate: string;
  orderInfo: string;
  ipAddress: string;
  now?: Date;
}

type VnpayJson = Record<string, string | undefined>;

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

const QUERY_RESPONSE_FIELDS = [
  ...REFUND_RESPONSE_FIELDS,
  'vnp_PromotionCode',
  'vnp_PromotionAmount',
] as const;

/** Định dạng yyyyMMddHHmmss theo giờ Việt Nam (GMT+7) như VNPAY yêu cầu. */
export function formatVnpayDate(date: Date): string {
  const shifted = new Date(date.getTime() + VIETNAM_OFFSET_MS);
  const pad = (value: number) => String(value).padStart(2, '0');

  return (
    String(shifted.getUTCFullYear()) +
    pad(shifted.getUTCMonth() + 1) +
    pad(shifted.getUTCDate()) +
    pad(shifted.getUTCHours()) +
    pad(shifted.getUTCMinutes()) +
    pad(shifted.getUTCSeconds())
  );
}

function joinFields(source: VnpayJson, fields: readonly string[]): string {
  return fields.map((field) => source[field] ?? '').join('|');
}

/**
 * Phân loại phản hồi lệnh refund. Bảng mã dựa trên tài liệu VNPAY 2.1.0 và
 * PHẢI được đối chiếu lại bằng kết quả thật trên Sandbox khi có quyền.
 */
export function classifyRefundResponse(
  responseCode: string,
  transactionStatus: string,
): VnpayRefundOutcome {
  if (responseCode === '00') {
    if (transactionStatus === '09') return 'REJECTED';
    if (transactionStatus === '00') return 'COMPLETED';
    if (['05', '06'].includes(transactionStatus)) return 'ACCEPTED';
  }

  // Từ chối chắc chắn: không tồn tại, sai số tiền, giao dịch gốc không thành
  // công, sai TmnCode/định dạng/chữ ký của yêu cầu.
  if (['91', '93', '95', '02', '03', '97'].includes(responseCode)) {
    return 'REJECTED';
  }

  // 94 (đã gửi yêu cầu trước đó), 99 (lỗi khác) và mã lạ: có thể tiền đã hoàn.
  return 'UNKNOWN';
}

export function classifyQueryResponse(
  responseCode: string,
  transactionStatus: string,
  transactionType: string,
): VnpayRefundOutcome {
  if (responseCode !== '00') return 'UNKNOWN';

  const isFullRefund = transactionType === FULL_REFUND_TYPE;

  if (transactionStatus === '09' && isFullRefund) return 'REJECTED';

  if (['05', '06'].includes(transactionStatus) && isFullRefund) {
    return 'ACCEPTED';
  }

  if (transactionStatus === '00') {
    if (isFullRefund) return 'COMPLETED';

    return transactionType === '01'
      ? 'ORIGINAL_PAYMENT_CONFIRMED'
      : 'UNKNOWN';
  }

  return 'UNKNOWN';
}

@Injectable()
export class VnpayRefundClient {
  private readonly logger = new Logger(VnpayRefundClient.name);

  async requestRefund(
    input: VnpayRefundRequestInput,
  ): Promise<VnpayRefundResult> {
    const config = getVnpayConfig();

    const body: VnpayJson = {
      vnp_RequestId: input.requestId,
      vnp_Version: VNPAY_VERSION,
      vnp_Command: 'refund',
      vnp_TmnCode: config.tmnCode,
      vnp_TransactionType: FULL_REFUND_TYPE,
      vnp_TxnRef: input.txnRef,
      vnp_Amount: String(input.amount * 100),
      vnp_TransactionNo: input.transactionNo || '0',
      vnp_TransactionDate: input.transactionDate,
      vnp_CreateBy: input.createdBy,
      vnp_CreateDate: formatVnpayDate(input.now ?? new Date()),
      vnp_IpAddr: input.ipAddress,
      vnp_OrderInfo: input.orderInfo,
    };

    body.vnp_SecureHash = signVnpayData(
      joinFields(body, REFUND_REQUEST_FIELDS),
      config.hashSecret,
    );

    const response = await this.post(body, config);

    this.assertValidResponse(response, REFUND_RESPONSE_FIELDS, config, {
      txnRef: input.txnRef,
      command: 'refund',
      amount: input.amount,
      transactionType: FULL_REFUND_TYPE,
    });

    const responseCode = response.vnp_ResponseCode ?? '';
    const transactionStatus = response.vnp_TransactionStatus ?? '';

    return {
      outcome: classifyRefundResponse(responseCode, transactionStatus),
      responseId: response.vnp_ResponseId ?? '',
      responseCode,
      transactionStatus,
      transactionNo: response.vnp_TransactionNo ?? '',
      payDate: response.vnp_PayDate ?? '',
      message: response.vnp_Message ?? '',
    };
  }

  async queryTransaction(input: VnpayQueryInput): Promise<VnpayRefundResult> {
    const config = getVnpayConfig();

    const body: VnpayJson = {
      vnp_RequestId: input.requestId,
      vnp_Version: VNPAY_VERSION,
      vnp_Command: 'querydr',
      vnp_TmnCode: config.tmnCode,
      vnp_TxnRef: input.txnRef,
      vnp_OrderInfo: input.orderInfo,
      vnp_TransactionDate: input.transactionDate,
      vnp_CreateDate: formatVnpayDate(input.now ?? new Date()),
      vnp_IpAddr: input.ipAddress,
    };

    body.vnp_SecureHash = signVnpayData(
      joinFields(body, QUERY_REQUEST_FIELDS),
      config.hashSecret,
    );

    const response = await this.post(body, config);

    this.assertValidResponse(response, QUERY_RESPONSE_FIELDS, config, {
      txnRef: input.txnRef,
      command: 'querydr',
      amount: input.expectedAmount,
    });

    const responseCode = response.vnp_ResponseCode ?? '';
    const transactionStatus = response.vnp_TransactionStatus ?? '';

    return {
      outcome: classifyQueryResponse(
        responseCode,
        transactionStatus,
        response.vnp_TransactionType ?? '',
      ),
      responseId: response.vnp_ResponseId ?? '',
      responseCode,
      transactionStatus,
      transactionNo: response.vnp_TransactionNo ?? '',
      payDate: response.vnp_PayDate ?? '',
      message: response.vnp_Message ?? '',
    };
  }

  private async post(body: VnpayJson, config: VnpayConfig): Promise<VnpayJson> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs());

    try {
      const httpResponse = await fetch(config.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!httpResponse.ok) {
        throw new VnpayUncertainOutcomeError(
          'HTTP_ERROR',
          `VNPAY trả HTTP ${httpResponse.status}.`,
        );
      }

      const parsed: unknown = await httpResponse.json();

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new VnpayUncertainOutcomeError(
          'INVALID_RESPONSE',
          'Phản hồi VNPAY không phải đối tượng JSON.',
        );
      }

      const result: VnpayJson = {};

      for (const [key, value] of Object.entries(parsed)) {
        result[key] =
          typeof value === 'string' || typeof value === 'number'
            ? String(value)
            : undefined;
      }

      return result;
    } catch (error) {
      if (error instanceof VnpayUncertainOutcomeError) throw error;

      // Chỉ ghi loại lỗi và mã kỹ thuật.
      // Không ghi payload, giao dịch hoặc khóa bí mật VNPay.
      const cause = error instanceof Error ? error.cause : undefined;

      const rawCode =
        cause !== null && typeof cause === 'object' && 'code' in cause
          ? cause.code
          : undefined;

      const causeCode =
        typeof rawCode === 'string' && /^[A-Z0-9_]+$/.test(rawCode)
          ? rawCode
          : 'UNKNOWN';

      const errorName =
        error instanceof SyntaxError
          ? 'SyntaxError'
          : error instanceof TypeError
            ? 'TypeError'
            : error instanceof Error && error.name === 'AbortError'
              ? 'AbortError'
              : 'UNKNOWN';

      this.logger.error(
        `VNPay API diagnostic: error=${errorName}, causeCode=${causeCode}`,
      );

      if (error instanceof SyntaxError) {
        throw new VnpayUncertainOutcomeError(
          'INVALID_RESPONSE',
          'Phản hồi VNPAY không phải JSON hợp lệ.',
        );
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new VnpayUncertainOutcomeError(
          'TIMEOUT',
          'Hết thời gian chờ VNPAY.',
        );
      }

      throw new VnpayUncertainOutcomeError(
        'NETWORK',
        'Không kết nối được VNPAY.',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private assertValidResponse(
    response: VnpayJson,
    fields: readonly string[],
    config: VnpayConfig,
    expected: {
      txnRef: string;
      command: string;
      amount: number;
      transactionType?: string;
    },
  ): void {
    const validSignature = verifyVnpayDataSignature(
      joinFields(response, fields),
      response.vnp_SecureHash,
      config.hashSecret,
    );

    if (!validSignature) {
      const signature = response.vnp_SecureHash ? 'PRESENT' : 'MISSING';
      const responseCode = /^\d{2}$/.test(response.vnp_ResponseCode ?? '')
        ? response.vnp_ResponseCode
        : 'UNKNOWN';
      const message = (response.vnp_Message ?? '')
        .replace(/[^\p{L}\p{N} .,_:;()-]/gu, '')
        .trim()
        .slice(0, 160) || 'EMPTY';
      this.logger.warn(
        `VNPay refund diagnostic: signature=${signature}, ` +
          `unverifiedResponseCode=${responseCode}, unverifiedMessage=${message}`,
      );
      throw new VnpayUncertainOutcomeError(
        'INVALID_SIGNATURE',
        'Chữ ký phản hồi VNPAY không hợp lệ.',
      );
    }

    if (
      response.vnp_TmnCode !== config.tmnCode ||
      response.vnp_TxnRef !== expected.txnRef ||
      response.vnp_Command !== expected.command ||
      response.vnp_Amount !== String(expected.amount * 100) ||
      (expected.transactionType !== undefined &&
        response.vnp_TransactionType !== expected.transactionType)
    ) {
      throw new VnpayUncertainOutcomeError(
        'INVALID_RESPONSE',
        'Phản hồi VNPAY không khớp yêu cầu đã gửi.',
      );
    }
  }

  private timeoutMs(): number {
    const raw = Number(process.env.VNPAY_REFUND_TIMEOUT_MS);

    return Number.isSafeInteger(raw) && raw > 0
      ? raw
      : DEFAULT_TIMEOUT_MS;
  }
}
