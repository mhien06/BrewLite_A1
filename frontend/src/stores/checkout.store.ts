import { create } from "zustand";
import type { CartItem } from "@/types/cart";

interface PendingOrder {
  userId: number;
  orderId: number;
  cartFingerprint: string;
}

interface PaymentAttempt {
  userId: number;
  orderId: number;
  method: string;
  simulateSuccess: boolean | null;
  key: string;
}

interface CheckoutStore {
  paymentAttempt: PaymentAttempt | null;
  getPaymentKey: (
    userId: number,
    orderId: number,
    method: string,
    simulateSuccess: boolean,
  ) => string;
  getVnpayPaymentKey: (userId: number, orderId: number) => string;
  restoreVnpayPaymentAttempt: (
    userId: number,
    orderId: number,
    key: string,
  ) => void;
  clearPaymentAttempt: () => void;
  pendingOrder: PendingOrder | null;
  setPendingOrder: (
    userId: number,
    orderId: number,
    cartFingerprint: string,
  ) => void;
  clearPendingOrder: () => void;
}

export const createCartFingerprint = (items: CartItem[]) =>
  items
    .map((item) => `${item.key}:${item.quantity}`)
    .sort()
    .join("|");

export interface CheckoutContextSnapshot {
  userId: number;
  token: string;
  cartFingerprint: string;
}

export const isCheckoutContextCurrent = (
  submitted: CheckoutContextSnapshot,
  currentUserId: number | undefined,
  currentToken: string | null,
  currentItems: CartItem[],
) =>
  submitted.userId === currentUserId &&
  submitted.token === currentToken &&
  submitted.cartFingerprint === createCartFingerprint(currentItems);

export const useCheckoutStore = create<CheckoutStore>((set, get) => ({
  paymentAttempt: null,

  getPaymentKey: (userId, orderId, method, simulateSuccess) => {
    const previous = get().paymentAttempt;

    // Mất mạng chưa biết kết quả: gửi lại đúng khóa cũ.
    if (
      previous &&
      previous.userId === userId &&
      previous.orderId === orderId &&
      previous.method === method &&
      previous.simulateSuccess === simulateSuccess
    ) {
      return previous.key;
    }

    const key = `checkout-${orderId}-${crypto.randomUUID()}`;

    set({
      paymentAttempt: {
        userId,
        orderId,
        method,
        simulateSuccess,
        key,
      },
    });

    return key;
  },

  getVnpayPaymentKey: (userId, orderId) => {
    const previous = get().paymentAttempt;

    if (
      previous &&
      previous.userId === userId &&
      previous.orderId === orderId &&
      previous.method === "VNPAY" &&
      previous.simulateSuccess === null
    ) {
      return previous.key;
    }

    const key = `vnpay-${orderId}-${crypto.randomUUID()}`;

    set({
      paymentAttempt: {
        userId,
        orderId,
        method: "VNPAY",
        simulateSuccess: null,
        key,
      },
    });

    return key;
  },

  restoreVnpayPaymentAttempt: (userId, orderId, key) =>
    set({
      paymentAttempt: {
        userId,
        orderId,
        method: "VNPAY",
        simulateSuccess: null,
        key,
      },
    }),

  clearPaymentAttempt: () => set({ paymentAttempt: null }),

  pendingOrder: null,

  setPendingOrder: (userId, orderId, cartFingerprint) =>
    set({
      pendingOrder: {
        userId,
        orderId,
        cartFingerprint,
      },
    }),

  clearPendingOrder: () => set({ pendingOrder: null }),
}));
