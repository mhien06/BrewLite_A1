import type {
  PointCompensation,
  RefundStatus as OrderRefundStatus,
} from "@/types/order";

export type Ingredient = {
  id: number;
  name: string;
  code: string;
  unit: string;
  stock: number;
  version: number;
};
export type Recipe = {
  id: number;
  name: string;
  recipes: {
    amountS: number;
    amountM: number;
    amountL: number;
    isRequired: boolean;
    ingredient: Ingredient;
  }[];
};
export type Topping = {
  id: number;
  toppingCode: string;
  amount: number;
  ingredient: Ingredient;
};
export type { RefundStatus } from "@/types/order";
export type RefundAttemptStatus = "STARTED" | "CONFIRMED" | "REJECTED" | "AMBIGUOUS" | "FAILED";
export type OrderRefund = {
  id: number;
  amount: number;
  status: OrderRefundStatus;
  requestedAt: string;
  completedAt: string | null;
  reason: string;
  lastError: string | null;
  payment: {
    id: number;
    amount: number;
    method: "VNPAY";
  };
  attempts: {
    id: number;
    attemptNumber: number;
    type: "REFUND" | "QUERY";
    status: RefundAttemptStatus;
    requestId: string;
    responseCode: string | null;
    responseMessage: string | null;
    responseTransactionNo: string | null;
    responsePayDate: string | null;
    responseTransactionStatus: string | null;
    errorMessage: string | null;
    startedAt: string;
    completedAt: string | null;
    initiatedBy: { name: string } | null;
  }[];
};
export type Order = {
  refunds?: OrderRefund[];
  payments?: { id: number; amount: number; method: "WALLET" | "CARD" | "VNPAY"; status: "PAID"; paidAt: string | null }[];
  pointCompensations?: PointCompensation[];
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  cancellationSource?: "CUSTOMER" | "STAFF" | "SYSTEM" | null;
  cancelledBy?: { name: string } | null;
  id: number;
  status: string;
  total: number;
  user: { name: string };
  items: {
    id: number;
    size: string;
    quantity: number;
    toppings: string[];
    product: { name: string };
  }[];
};
export type Customer = {
  id: number;
  name: string;
  email: string;
  loyaltyPoints: number;
  loyaltyTransactions: {
    orderId: number;
    points: number;
    reversed?: boolean;
    createdAt: string;
  }[];
  pointCompensations: (PointCompensation & { orderId: number })[];
};
export type Movement = {
  id: number;
  delta: number;
  before: number;
  after: number;
  reason: string;
  createdAt: string;
  ingredient: { name: string; unit: string };
  actor: { name: string };
};
