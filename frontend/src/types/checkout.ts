import type { CartSizeId } from '@/types/cart';

export interface CreateOrderItemRequest {
  productId: number;
  size: CartSizeId;
  quantity: number;
  toppings: string[];
}

export interface CreateOrderRequest {
  items: CreateOrderItemRequest[];
}

export interface OrderResponse {
  id: number;
  userId: number;
  status: 'PENDING';
  total: number;
  createdAt: string;
}

export type PaymentMethod = 'WALLET' | 'CARD';

export interface CreatePaymentRequest {
  orderId: number;
  method: PaymentMethod;
  simulateSuccess: boolean;
}

export interface PaymentResponse {
  id: number;
  userId: number;
  status: 'PAID' | 'PAYMENT_FAILED';
  paymentMethod: PaymentMethod;
  total: number;
  paidAt: string | null;
  createdAt: string;
}