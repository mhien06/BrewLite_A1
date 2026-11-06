import type { CartSizeId } from "@/types/cart";

export interface CreateOrderItemRequest {
  productId: number;
  size: CartSizeId;
  quantity: number;
  toppings: string[];
}

export interface CreateOrderRequest {
  items: CreateOrderItemRequest[];
  promotionCode?: string;
}

export interface OrderResponse {
  id: number;
  userId: number;
  status: "PENDING";
  promotionCode?: string | null;
  subtotal?: number;
  discountAmount?: number;
  total: number;
  createdAt: string;
}

export type MockPaymentMethod = "WALLET" | "CARD";
export type PaymentMethod = MockPaymentMethod | "VNPAY";

export interface CreatePaymentRequest {
  orderId: number;
  method: MockPaymentMethod;
  simulateSuccess: boolean;
}

export interface PaymentResponse {
  id: number;
  userId: number;
  status: "PAID" | "PAYMENT_FAILED";
  paymentMethod: MockPaymentMethod;
  total: number;
  paidAt: string | null;
  createdAt: string;
}

export type VnpayLocale = "vn" | "en";

export interface CreateVnpayPaymentUrlRequest {
  orderId: number;
  locale?: VnpayLocale;
}

export interface VnpayPaymentUrlResponse {
  orderId: number;
  paymentId: number;
  txnRef: string;
  amount: number;
  status: "PENDING";
  paymentUrl: string;
  expiresAt: string;
}
