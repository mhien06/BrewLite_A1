import type { Order } from '@/types/order';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export class OrdersServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'OrdersServiceError';
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

async function getApi<T>(
  path: string,
  token: string,
  defaultMessage: string,
): Promise<T> {
  const endpoint = `${API_BASE_URL.replace(/\/$/, '')}${path}`;

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response, defaultMessage);
    throw new OrdersServiceError(message, response.status);
  }

  return response.json() as Promise<T>;
}

export function getMyOrdersApi(token: string): Promise<Order[]> {
  return getApi<Order[]>(
    '/orders/me',
    token,
    'Không thể tải lịch sử đơn hàng.',
  );
}

export function getOrderByIdApi(
  token: string,
  orderId: number | string,
): Promise<Order> {
  return getApi<Order>(
    `/orders/${orderId}`,
    token,
    'Không thể tải thông tin đơn hàng.',
  );
}
