import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VnpayParams } from './vnpay-signature.js';
import {
  signVnpayQueryRequest,
  signVnpayRefundRequest,
} from './vnpay-transaction-signature.js';
import { VnpayTransactionApiService } from './vnpay-transaction-api.service.js';

describe('VnpayTransactionApiService - QueryDR', () => {
  const fetchMock = vi.fn();
  let service: VnpayTransactionApiService;

  function validResponse(): VnpayParams {
    return {
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
      vnp_OrderInfo: 'Truy van giao dich BL123',
      vnp_SecureHash:
        'fd9789b674cef3b60cf1f9149f0ec34c714e06758c515acd3e2745314d71c46548a01a32002b2e452bd62c53d9c6b1ce8fef58522f3642abe347f005cb8e2a48',
    };
  }

  function validRefundResponse(): VnpayParams {
    return {
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
      vnp_OrderInfo: 'Hoan tien giao dich BL123',
      vnp_SecureHash:
        '4bd8f5f06871a4f2f2ad56c65a943585b968cf124526e3d595400200c9afba870b041283b99d5673c34e73ebe00c1efac920bf6e9bd1b485279914e0c218713d',
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);

    process.env.VNPAY_TMN_CODE = 'TESTCODE';
    process.env.VNPAY_HASH_SECRET = 'test-secret';
    process.env.VNPAY_PAYMENT_URL =
      'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
    process.env.VNPAY_API_URL =
      'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction';
    process.env.VNPAY_RETURN_URL = 'https://example.test/payments/vnpay/return';
    process.env.FRONTEND_URL = 'http://localhost:3000';

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(validResponse()),
    });

    service = new VnpayTransactionApiService();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a signed QueryDR request and verifies the response', async () => {
    const result = await service.queryTransaction(
      {
        txnRef: 'BL123',
        expectedAmount: 172_800,
        transactionDate: new Date('2026-11-04T06:30:44.000Z'),
        transactionNo: '123456',
        ipAddress: '127.0.0.1',
      },
      new Date('2026-11-04T07:00:00.000Z'),
    );

    expect(result.vnp_TransactionStatus).toBe('00');

    const [apiUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const requestBody = JSON.parse(init.body as string) as VnpayParams;

    expect(apiUrl).toBe(
      'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
    );
    expect(requestBody.vnp_Command).toBe('querydr');
    expect(requestBody.vnp_TxnRef).toBe('BL123');
    expect(requestBody.vnp_TransactionDate).toBe('20261104133044');
    expect(requestBody.vnp_CreateDate).toBe('20261104140000');
    expect(requestBody.vnp_RequestId).toMatch(/^[0-9a-f]{32}$/);
    expect(requestBody.vnp_SecureHash).toBe(
      signVnpayQueryRequest(requestBody, 'test-secret'),
    );
  });

  it('rejects a response with an invalid signature', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        ...validResponse(),
        vnp_Amount: '17280001',
      }),
    });

    await expect(
      service.queryTransaction({
        txnRef: 'BL123',
        expectedAmount: 172_800,
        transactionDate: new Date(),
        ipAddress: '127.0.0.1',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('rejects an unsuccessful HTTP response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn(),
    });

    await expect(
      service.queryTransaction({
        txnRef: 'BL123',
        expectedAmount: 172_800,
        transactionDate: new Date(),
        ipAddress: '127.0.0.1',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('sends a signed full-refund request and verifies the response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(validRefundResponse()),
    });

    const result = await service.refundTransaction(
      {
        txnRef: 'BL123',
        amount: 172_800,
        transactionNo: '123456',
        transactionDate: new Date('2026-11-04T06:30:44.000Z'),
        createdBy: 'staff@gmail.com',
        ipAddress: '127.0.0.1',
      },
      new Date('2026-11-04T07:05:00.000Z'),
    );

    expect(result.vnp_TransactionStatus).toBe('00');

    const [, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    const requestBody = JSON.parse(init.body as string) as VnpayParams;

    expect(requestBody.vnp_Command).toBe('refund');
    expect(requestBody.vnp_TransactionType).toBe('02');
    expect(requestBody.vnp_Amount).toBe('17280000');
    expect(requestBody.vnp_CreateDate).toBe('20261104140500');
    expect(requestBody.vnp_SecureHash).toBe(
      signVnpayRefundRequest(requestBody, 'test-secret'),
    );
  });

  it('rejects a refund response whose amount differs from the request', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(validRefundResponse()),
    });

    await expect(
      service.refundTransaction({
        txnRef: 'BL123',
        amount: 170_000,
        transactionDate: new Date(),
        createdBy: 'staff@gmail.com',
        ipAddress: '127.0.0.1',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('rejects an invalid refund amount before calling VNPAY', async () => {
    await expect(
      service.refundTransaction({
        txnRef: 'BL123',
        amount: 0,
        transactionDate: new Date(),
        createdBy: 'staff@gmail.com',
        ipAddress: '127.0.0.1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a signed QueryDR response whose amount differs from the database', async () => {
    await expect(
      service.queryTransaction({
        txnRef: 'BL123',
        expectedAmount: 170_000,
        transactionDate: new Date(),
        ipAddress: '127.0.0.1',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('rejects a refund response with another transaction type', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(validRefundResponse()),
    });

    await expect(
      service.refundTransaction({
        txnRef: 'BL123',
        amount: 172_800,
        transactionDate: new Date(),
        createdBy: 'staff@gmail.com',
        ipAddress: '127.0.0.1',
        transactionType: '03',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('maps a VNPAY network failure to BadGatewayException', async () => {
    fetchMock.mockRejectedValue(new Error('network failure'));

    await expect(
      service.queryTransaction({
        txnRef: 'BL123',
        expectedAmount: 172_800,
        transactionDate: new Date(),
        ipAddress: '127.0.0.1',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
