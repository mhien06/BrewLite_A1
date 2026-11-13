import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { getVnpayConfig } from './vnpay-config.js';
import { normalizeVnpayQuery, type VnpayParams } from './vnpay-signature.js';
import {
  signVnpayQueryRequest,
  signVnpayRefundRequest,
  verifyVnpayQueryResponse,
  verifyVnpayRefundResponse,
} from './vnpay-transaction-signature.js';
import { formatVnpayDate } from './vnpay-url.js';

const VNPAY_API_TIMEOUT_MS = 10_000;

export class VnpayApiError extends BadGatewayException {
  constructor(readonly reason: 'NETWORK' | 'TIMEOUT' | 'HTTP_ERROR' | 'INVALID_JSON' | 'INVALID_RESPONSE' | 'INVALID_SIGNATURE' | 'MISMATCHED_RESPONSE') {
    super(`VNPay API: ${reason}`);
  }
}

export interface QueryVnpayTransactionInput {
  txnRef: string;
  transactionDate: Date;
  transactionNo?: string | null;
  ipAddress: string;
  expectedAmount: number;
  requestId?: string;
}

export interface RefundVnpayTransactionInput {
  txnRef: string;
  amount: number;
  transactionNo?: string | null;
  transactionDate: Date;
  createdBy: string;
  ipAddress: string;
  transactionType?: '02' | '03';
  requestId?: string;
}

@Injectable()
export class VnpayTransactionApiService {
  async queryTransaction(
    input: QueryVnpayTransactionInput,
    requestedAt = new Date(),
  ): Promise<VnpayParams> {
    if (
      !Number.isSafeInteger(input.expectedAmount) ||
      input.expectedAmount <= 0
    ) {
      throw new BadRequestException('Số tiền giao dịch không hợp lệ.');
    }

    const config = getVnpayConfig();

    const params: VnpayParams = {
      vnp_RequestId: input.requestId ?? this.createRequestId(),
      vnp_Version: '2.1.0',
      vnp_Command: 'querydr',
      vnp_TmnCode: config.tmnCode,
      vnp_TxnRef: input.txnRef,
      vnp_OrderInfo: `Truy van giao dich ${input.txnRef}`,
      vnp_TransactionDate: formatVnpayDate(input.transactionDate),
      vnp_CreateDate: formatVnpayDate(requestedAt),
      vnp_IpAddr: this.normalizeIpAddress(input.ipAddress),
    };

    if (input.transactionNo) {
      params.vnp_TransactionNo = input.transactionNo;
    }

    params.vnp_SecureHash = signVnpayQueryRequest(params, config.hashSecret);

    const result = await this.post(config.apiUrl, params);

    if (!verifyVnpayQueryResponse(result, config.hashSecret)) {
      throw new VnpayApiError('INVALID_SIGNATURE');
    }
    if (
      result.vnp_Command !== 'querydr' ||
      result.vnp_TmnCode !== config.tmnCode ||
      result.vnp_TxnRef !== input.txnRef ||
      result.vnp_Amount !== String(input.expectedAmount * 100)
    ) {
      throw new VnpayApiError('MISMATCHED_RESPONSE');
    }

    return result;
  }

  async refundTransaction(
    input: RefundVnpayTransactionInput,
    requestedAt = new Date(),
  ): Promise<VnpayParams> {
    if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
      throw new BadRequestException('Số tiền hoàn không hợp lệ.');
    }

    const createdBy = input.createdBy.trim();

    if (!createdBy || createdBy.length > 245) {
      throw new BadRequestException('Người tạo yêu cầu hoàn không hợp lệ.');
    }

    const config = getVnpayConfig();

    const params: VnpayParams = {
      vnp_RequestId: input.requestId ?? this.createRequestId(),
      vnp_Version: '2.1.0',
      vnp_Command: 'refund',
      vnp_TmnCode: config.tmnCode,
      vnp_TransactionType: input.transactionType ?? '02',
      vnp_TxnRef: input.txnRef,
      vnp_Amount: String(input.amount * 100),
      vnp_TransactionNo: input.transactionNo ?? '',
      vnp_TransactionDate: formatVnpayDate(input.transactionDate),
      vnp_CreateBy: createdBy,
      vnp_CreateDate: formatVnpayDate(requestedAt),
      vnp_IpAddr: this.normalizeIpAddress(input.ipAddress),
      vnp_OrderInfo: `Hoan tien giao dich ${input.txnRef}`,
    };

    params.vnp_SecureHash = signVnpayRefundRequest(params, config.hashSecret);

    const result = await this.post(config.apiUrl, params);

    if (
      !verifyVnpayRefundResponse(result, config.hashSecret) ||
      result.vnp_Command !== 'refund' ||
      result.vnp_TmnCode !== config.tmnCode ||
      result.vnp_TxnRef !== input.txnRef ||
      result.vnp_Amount !== params.vnp_Amount ||
      result.vnp_TransactionType !== params.vnp_TransactionType
    ) {
      throw new BadGatewayException('Phản hồi Refund từ VNPAY không hợp lệ.');
    }

    return result;
  }

  private async post(
    apiUrl: string,
    params: VnpayParams,
  ): Promise<VnpayParams> {
    let response: Response;

    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(VNPAY_API_TIMEOUT_MS),
      });
    } catch (error) {
      throw new VnpayApiError(
        error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
          ? 'TIMEOUT' : 'NETWORK',
      );
    }

    if (!response.ok) {
      throw new VnpayApiError('HTTP_ERROR');
    }

    let body: unknown;

    try {
      body = await response.json();
    } catch {
      throw new VnpayApiError('INVALID_JSON');
    }

    const normalized = this.normalizeResponse(body);

    if (!normalized) {
      throw new VnpayApiError('INVALID_RESPONSE');
    }

    return normalized;
  }

  private normalizeResponse(value: unknown): VnpayParams | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    return normalizeVnpayQuery(value as Record<string, unknown>);
  }

  private normalizeIpAddress(rawIpAddress: string): string {
    const firstAddress = rawIpAddress
      .split(',')[0]
      ?.trim()
      .replace(/^::ffff:/, '');

    return firstAddress || '127.0.0.1';
  }

  private createRequestId(): string {
    return randomBytes(16).toString('hex');
  }
}
