import type {
  CreateOrderRequest,
  CreatePaymentRequest,
  OrderResponse,
  PaymentResponse,
} from '@/types/checkout';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export class CheckoutServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'CheckoutServiceError';
  }
}

async function parseErrorMessage(
  response: Response,
  defaultMessage: string,
): Promise<string> {
  try {
    const data: unknown = await response.json();

    if (typeof data === 'object' && data !== null && 'message' in data) {
      const message = (data as { message: unknown }).message;

      if (typeof message === 'string') return message;
      if (Array.isArray(message)) return message.join(', ');
    }
  } catch {
    // Dùng thông báo mặc định nếu response không phải JSON.
  }

  return defaultMessage;
}

async function postApi<T>(
  path: string,
  token: string,
  body: unknown,
  defaultMessage: string,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const endpoint = `${API_BASE_URL.replace(/\/$/, '')}${path}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response, defaultMessage);
    throw new CheckoutServiceError(message, response.status);
  }

  return response.json() as Promise<T>;
}

export function createOrderApi(
  token: string,
  request: CreateOrderRequest,
): Promise<OrderResponse> {
  return postApi(
    '/orders',
    token,
    request,
    'Không thể tạo đơn hàng.',
  );
}

export function createPaymentApi(
  token: string,
  request: CreatePaymentRequest,
  idempotencyKey?: string,
): Promise<PaymentResponse> {
  const trimmedKey = idempotencyKey?.trim();
  return postApi(
    '/payments',
    token,
    request,
    'Không thể xử lý thanh toán.',
    trimmedKey ? { 'Idempotency-Key': trimmedKey } : {},
  );
}
