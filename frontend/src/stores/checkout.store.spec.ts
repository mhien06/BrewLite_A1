import { beforeEach, describe, expect, it } from 'vitest';
import {
  createCartFingerprint,
  useCheckoutStore,
} from '@/stores/checkout.store';
import type { CartItem } from '@/types/cart';

const item = (key: string, quantity: number): CartItem => ({
  key,
  productId: 1,
  name: 'Cà phê sữa',
  imageUrl: '/products/ca-phe-sua.jpg',
  stock: 50,
  size: { id: 'M', label: 'Vừa', extra: 5_000 },
  toppings: [],
  unitPrice: 34_000,
  quantity,
});

describe('checkout store', () => {
  beforeEach(() => {
    useCheckoutStore.getState().clearPendingOrder();
  });

  it('stores and clears a pending order', () => {
    useCheckoutStore.getState().setPendingOrder(10, 'cart-1');

    expect(useCheckoutStore.getState().pendingOrder).toEqual({
      orderId: 10,
      cartFingerprint: 'cart-1',
    });

    useCheckoutStore.getState().clearPendingOrder();
    expect(useCheckoutStore.getState().pendingOrder).toBeNull();
  });

  it('creates the same fingerprint regardless of item order', () => {
    const first = item('1:M:', 1);
    const second = item('2:L:pearls', 2);

    expect(createCartFingerprint([first, second])).toBe(
      createCartFingerprint([second, first]),
    );
  });

  it('changes fingerprint when quantity changes', () => {
    expect(createCartFingerprint([item('1:M:', 1)])).not.toBe(
      createCartFingerprint([item('1:M:', 2)]),
    );
  });
});