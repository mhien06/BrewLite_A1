import { create } from 'zustand';
import type { CartItem } from '@/types/cart';

interface PendingOrder {
  orderId: number;
  cartFingerprint: string;
}

interface CheckoutStore {
  pendingOrder: PendingOrder | null;
  setPendingOrder: (orderId: number, cartFingerprint: string) => void;
  clearPendingOrder: () => void;
}

export const createCartFingerprint = (items: CartItem[]) =>
  items
    .map((item) => `${item.key}:${item.quantity}`)
    .sort()
    .join('|');

export const useCheckoutStore = create<CheckoutStore>((set) => ({
  pendingOrder: null,

  setPendingOrder: (orderId, cartFingerprint) =>
    set({
      pendingOrder: {
        orderId,
        cartFingerprint,
      },
    }),

  clearPendingOrder: () => set({ pendingOrder: null }),
}));