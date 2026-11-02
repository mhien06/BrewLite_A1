import { create } from "zustand";
import type { AddCartItemInput, CartItem } from "@/types/cart";

interface CartStore {
  items: CartItem[];
  addItem: (item: AddCartItemInput) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clearCart: () => void;
  applyCheckedItems: (previous: CartItem[], next: CartItem[]) => boolean;
}

const createCartItemKey = (item: AddCartItemInput) => {
  const toppingIds = item.toppings
    .map((topping) => topping.id)
    .sort()
    .join(",");

  return `${item.productId}:${item.size.id}:${toppingIds}`;
};

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],

  addItem: (item) =>
    set((state) => {
      const currentProductQuantity = state.items
        .filter((cartItem) => cartItem.productId === item.productId)
        .reduce((total, cartItem) => total + cartItem.quantity, 0);

      if (item.stock <= 0 || currentProductQuantity >= item.stock) {
        return state;
      }

      const key = createCartItemKey(item);
      const existingItem = state.items.find((cartItem) => cartItem.key === key);

      if (existingItem) {
        return {
          items: state.items.map((cartItem) =>
            cartItem.key === key
              ? { ...cartItem, quantity: cartItem.quantity + 1 }
              : cartItem,
          ),
        };
      }

      return {
        items: [
          ...state.items,
          {
            ...item,
            key,
            quantity: 1,
            toppings: [...item.toppings].sort((a, b) =>
              a.id.localeCompare(b.id),
            ),
          },
        ],
      };
    }),

  updateQuantity: (key, quantity) =>
    set((state) => {
      const item = state.items.find((cartItem) => cartItem.key === key);

      if (!item) {
        return state;
      }

      const normalizedQuantity = Math.floor(quantity);

      if (normalizedQuantity <= 0) {
        return {
          items: state.items.filter((cartItem) => cartItem.key !== key),
        };
      }

      const otherQuantity = state.items
        .filter(
          (cartItem) =>
            cartItem.productId === item.productId && cartItem.key !== key,
        )
        .reduce((total, cartItem) => total + cartItem.quantity, 0);

      const maximumQuantity = Math.max(0, item.stock - otherQuantity);

      if (maximumQuantity === 0) {
        return {
          items: state.items.filter((cartItem) => cartItem.key !== key),
        };
      }

      return {
        items: state.items.map((cartItem) =>
          cartItem.key === key
            ? {
                ...cartItem,
                quantity: Math.min(normalizedQuantity, maximumQuantity),
              }
            : cartItem,
        ),
      };
    }),

  removeItem: (key) =>
    set((state) => ({
      items: state.items.filter((item) => item.key !== key),
    })),

  // Không ghi đè nếu khách đã sửa giỏ trong lúc request đang chờ.
  applyCheckedItems: (previous, next) => {
    if (get().items !== previous) return false;
    set({ items: next });
    return true;
  },
  clearCart: () => set({ items: [] }),
}));

export const selectTotalQuantity = (state: CartStore) =>
  state.items.reduce((total, item) => total + item.quantity, 0);

export const selectTotalPrice = (state: CartStore) =>
  state.items.reduce(
    (total, item) => total + item.unitPrice * item.quantity,
    0,
  );
