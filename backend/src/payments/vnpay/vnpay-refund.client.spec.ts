import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  classifyQueryResponse,
  classifyRefundResponse,
  formatVnpayDate,
  VnpayRefundClient,
  VnpayUncertainOutcomeError,
} from './vnpay-refund.client.js';
import { signVnpayData } from './vnpay-signature.js';

const SECRET = 'test-secret';
const REFUND_RESPONSE_ORDER = [
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
];
const QUERY_RESPONSE_ORDER = [
  ...REFUND_RESPONSE_ORDER,
  'vnp_PromotionCode',
  'vnp_PromotionAmount',
];

function signedResponse(
  overrides: Record<string, string> = {},
  fields = REFUND_RESPONSE_ORDER,
) {
  const body: Record<string, string> = {
    vnp_ResponseId: 'resp-1',
    vnp_Command: 'refund',
    vnp_ResponseCode: '00',
    vnp_Message: 'Refund success',
    vnp_TmnCode: 'TESTCODE',
    vnp_TxnRef: 'BL123',
    vnp_Amount: '4500000',
    vnp_BankCode: 'NCB',
    vnp_PayDate: '20261111100000',
    vnp_TransactionNo: '14000001',
    vnp_TransactionType: '02',
    vnp_TransactionStatus: '05',
    vnp_OrderInfo: 'Hoan tien don 1',
    ...overrides,
  };
  body.vnp_SecureHash = signVnpayData(
    fields.map((field) => body[field] ?? '').join('|'),
    SECRET,
  );
  return body;
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const refundInput = {
  requestId: 'RF0001',
  txnRef: 'BL123',
  amount: 45000,
  transactionNo: '14000001',
  transactionDate: '20261111100000',
  createdBy: 'staff-7',
  orderInfo: 'Hoan tien don 1',
  ipAddress: '127.0.0.1',
  now: new Date('2026-11-11T03:04:05.000Z'),
};

describe('VnpayRefundClient', () => {
  const fetchMock = vi.fn();
  const client = new VnpayRefundClient();

  beforeEach(() => {
    process.env.VNPAY_TMN_CODE = 'TESTCODE';
    process.env.VNPAY_HASH_SECRET = SECRET;
    process.env.VNPAY_RETURN_URL = 'https://example.test/payments/vnpay/return';
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('formats dates in GMT+7', () => {
    expect(formatVnpayDate(new Date('2026-11-11T03:04:05.000Z'))).toBe(
      '20261111100405',
    );
  });

  it('signs the refund request with the documented field order and amount x100', async () => {
    fetchMock.mockResolvedValue(jsonResponse(signedResponse()));

    await client.requestRefund(refundInput);

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    const sent = JSON.parse(init.body) as Record<string, string>;
    expect(sent.vnp_Command).toBe('refund');
    expect(sent.vnp_TransactionType).toBe('02');
    expect(sent.vnp_Amount).toBe('4500000');
    expect(sent.vnp_CreateDate).toBe('20261111100405');
    const expectedData = [
      'RF0001',
      '2.1.0',
      'refund',
      'TESTCODE',
      '02',
      'BL123',
      '4500000',
      '14000001',
      '20261111100000',
      'staff-7',
      '20261111100405',
      '127.0.0.1',
      'Hoan tien don 1',
    ].join('|');
    expect(sent.vnp_SecureHash).toBe(signVnpayData(expectedData, SECRET));
  });

  it('treats an accepted refund (status 05) as ACCEPTED, not completed', async () => {
    fetchMock.mockResolvedValue(jsonResponse(signedResponse()));
    const result = await client.requestRefund(refundInput);
    expect(result.outcome).toBe('ACCEPTED');
    expect(result.transactionStatus).toBe('05');
  });

  it('returns REJECTED when VNPAY refuses with a definitive code', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        signedResponse({
          vnp_ResponseCode: '95',
          vnp_Message: 'Refund rejected',
          vnp_TransactionStatus: '',
        }),
      ),
    );
    const result = await client.requestRefund(refundInput);
    expect(result.outcome).toBe('REJECTED');
  });

  it('returns UNKNOWN for duplicate (94) so it can be reconciled', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(signedResponse({ vnp_ResponseCode: '94' })),
    );
    const result = await client.requestRefund(refundInput);
    expect(result.outcome).toBe('UNKNOWN');
  });

  it('rejects a response with a forged signature as uncertain', async () => {
    const body = signedResponse();
    body.vnp_SecureHash = 'a'.repeat(128);
    fetchMock.mockResolvedValue(jsonResponse(body));
    await expect(client.requestRefund(refundInput)).rejects.toMatchObject({
      reason: 'INVALID_SIGNATURE',
    });
  });

  it('rejects a validly signed response for another transaction', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(signedResponse({ vnp_TxnRef: 'OTHER' })),
    );
    await expect(client.requestRefund(refundInput)).rejects.toMatchObject({
      reason: 'INVALID_RESPONSE',
    });
  });

  it('rejects a response for a partial refund request type', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(signedResponse({ vnp_TransactionType: '03' })),
    );
    await expect(client.requestRefund(refundInput)).rejects.toMatchObject({
      reason: 'INVALID_RESPONSE',
    });
  });

  it('rejects a validly signed response for a different amount', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(signedResponse({ vnp_Amount: '4500001' })),
    );
    await expect(client.requestRefund(refundInput)).rejects.toMatchObject({
      reason: 'INVALID_RESPONSE',
    });
  });

  it('reports a timeout as uncertain, never as failure', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new Error('aborted'), { name: 'AbortError' }),
    );
    await expect(client.requestRefund(refundInput)).rejects.toMatchObject({
      reason: 'TIMEOUT',
    });
  });

  it('reports network errors and HTTP 5xx as uncertain', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    await expect(client.requestRefund(refundInput)).rejects.toBeInstanceOf(
      VnpayUncertainOutcomeError,
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 502));
    await expect(client.requestRefund(refundInput)).rejects.toMatchObject({
      reason: 'HTTP_ERROR',
    });
  });

  it('only treats a successful query for the original payment as proof no refund started', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        signedResponse(
          {
            vnp_Command: 'querydr',
            vnp_TransactionType: '01',
            vnp_TransactionStatus: '00',
          },
          QUERY_RESPONSE_ORDER,
        ),
      ),
    );

    const result = await client.queryTransaction({
      requestId: 'Q0001',
      txnRef: 'BL123',
      expectedAmount: 45000,
      transactionDate: '20261111100000',
      orderInfo: 'Hoan tien don 1',
      ipAddress: '127.0.0.1',
    });

    expect(result.outcome).toBe('NOT_STARTED');
  });

  it('does not use a query with a mismatched amount to authorize a retry', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        signedResponse(
          {
            vnp_Command: 'querydr',
            vnp_TransactionType: '01',
            vnp_Amount: '4499900',
          },
          QUERY_RESPONSE_ORDER,
        ),
      ),
    );

    await expect(
      client.queryTransaction({
        requestId: 'Q0001',
        txnRef: 'BL123',
        expectedAmount: 45000,
        transactionDate: '20261111100000',
        orderInfo: 'Hoan tien don 1',
        ipAddress: '127.0.0.1',
      }),
    ).rejects.toMatchObject({ reason: 'INVALID_RESPONSE' });
  });

  it('classifies querydr results', () => {
    expect(classifyQueryResponse('00', '06', '02')).toBe('ACCEPTED');
    expect(classifyQueryResponse('00', '00', '02')).toBe('COMPLETED');
    expect(classifyQueryResponse('00', '00', '01')).toBe('NOT_STARTED');
    expect(classifyQueryResponse('00', '09', '02')).toBe('REJECTED');
    expect(classifyQueryResponse('00', '00', '03')).toBe('UNKNOWN');
    expect(classifyQueryResponse('99', '', '')).toBe('UNKNOWN');
    expect(classifyQueryResponse('91', '', '')).toBe('UNKNOWN');
    expect(classifyQueryResponse('00', '05', '01')).toBe('UNKNOWN');
  });

  it('classifies refund response codes', () => {
    expect(classifyRefundResponse('00', '00')).toBe('COMPLETED');
    expect(classifyRefundResponse('00', '09')).toBe('REJECTED');
    expect(classifyRefundResponse('00', 'unknown')).toBe('UNKNOWN');
    expect(classifyRefundResponse('91', '')).toBe('REJECTED');
    expect(classifyRefundResponse('99', '')).toBe('UNKNOWN');
  });
});
