import { create } from "zustand";
import type { CartItem } from "@/types/cart";

interface PendingOrder {
  userId: number;
  orderId: number;
  cartFingerprint: string;
}

interface CheckoutStore {
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

export const useCheckoutStore = create<CheckoutStore>((set) => ({
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
