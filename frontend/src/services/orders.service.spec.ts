import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getMyOrdersApi,
  getOrderByIdApi,
  OrdersServiceError,
} from '@/services/orders.service';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('orders service (T09A)', () => {
  describe('getMyOrdersApi', () => {
    it('fetches user orders with Bearer JWT', async () => {
      const mockOrders = [
        {
          id: 10,
          userId: 1,
          status: 'PAID',
          paymentMethod: 'WALLET',
          paidAt: '2026-10-31T00:00:00.000Z',
          total: 50000,
          createdAt: '2026-10-31T00:00:00.000Z',
          items: [],
        },
      ];

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockOrders), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const orders = await getMyOrdersApi('test-token');

      expect(orders).toEqual(mockOrders);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/orders/me'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );
    });

    it('throws OrdersServiceError on 401 Unauthorized', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ message: 'Không được phép truy cập.' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      vi.stubGlobal('fetch', fetchMock);

      await expect(getMyOrdersApi('invalid-token')).rejects.toThrow(
        OrdersServiceError,
      );
    });
  });

  describe('getOrderByIdApi', () => {
    it('fetches single order by id with Bearer JWT', async () => {
      const mockOrder = {
        id: 123,
        userId: 1,
        status: 'PAID',
        paymentMethod: 'CARD',
        paidAt: '2026-10-31T00:00:00.000Z',
        total: 65000,
        createdAt: '2026-10-31T00:00:00.000Z',
        items: [
          {
            id: 1,
            productId: 1,
            size: 'M',
            toppings: ['pearls'],
            quantity: 1,
            unitPrice: 40000,
            lineTotal: 40000,
            product: { id: 1, name: 'Cà phê sữa' },
          },
        ],
      };

      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockOrder), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const order = await getOrderByIdApi('test-token', 123);

      expect(order).toEqual(mockOrder);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/orders/123'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        }),
      );
    });

    it('throws OrdersServiceError when order not found (404)', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ message: 'Không tìm thấy đơn hàng.' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      vi.stubGlobal('fetch', fetchMock);

      await expect(getOrderByIdApi('test-token', 999)).rejects.toThrow(
        'Không tìm thấy đơn hàng.',
      );
    });
  });
});
