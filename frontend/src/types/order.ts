import type { RefundSummary } from "@/components/RefundNotice";
import type { PaymentMethod } from "@/types/checkout";

export type OrderStatus =
  | "PENDING"
  | "PAID"
  | "PAYMENT_FAILED"
  | "PREPARING"
  | "READY"
  | "COMPLETED"
  | "CANCELLED";

export interface OrderItemProduct {
  id: number;
  name: string;
  imageUrl?: string;
}

export interface OrderItem {
  id?: number;
  productId: number;
  size: string;
  toppings: string[];
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  product?: OrderItemProduct;
}

export interface Order {
  cancellationReason?: string | null;
  cancellationSource?: string | null;
  payments?: RefundSummary[];
  id: number;
  userId: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod | null;
  paidAt: string | null;
  total: number;
  createdAt: string;
  items: OrderItem[];
}
