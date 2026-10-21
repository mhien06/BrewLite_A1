import { beforeEach, describe, expect, it } from 'vitest';
import {
  selectTotalPrice,
  selectTotalQuantity,
  useCartStore,
} from './cart.store';
import type { AddCartItemInput } from '@/types/cart';

const baseItem: AddCartItemInput = {
  productId: 1,
  name: 'Cà phê sữa',
  imageUrl: '/coffee.jpg',
  stock: 3,
  size: {
    id: 'M',
    label: 'Vừa',
    extra: 5_000,
  },
  toppings: [],
  unitPrice: 35_000,
};

describe('cart store', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [] });
  });

  it('merges items with the same product options', () => {
    const { addItem } = useCartStore.getState();

    addItem(baseItem);
    addItem(baseItem);

    const state = useCartStore.getState();

    expect(state.items).toHaveLength(1);
    expect(state.items[0].quantity).toBe(2);
    expect(selectTotalQuantity(state)).toBe(2);
    expect(selectTotalPrice(state)).toBe(70_000);
  });

  it('keeps items with different options on separate lines', () => {
    const { addItem } = useCartStore.getState();

    addItem(baseItem);
    addItem({
      ...baseItem,
      size: {
        id: 'L',
        label: 'Lớn',
        extra: 10_000,
      },
      toppings: [
        {
          id: 'pearls',
          label: 'Trân châu',
          price: 8_000,
        },
      ],
      unitPrice: 48_000,
    });

    const state = useCartStore.getState();

    expect(state.items).toHaveLength(2);
    expect(selectTotalQuantity(state)).toBe(2);
    expect(selectTotalPrice(state)).toBe(83_000);
  });

  it('updates quantity and removes an item', () => {
    const { addItem } = useCartStore.getState();

    addItem(baseItem);

    const key = useCartStore.getState().items[0].key;

    useCartStore.getState().updateQuantity(key, 2);
    expect(useCartStore.getState().items[0].quantity).toBe(2);

    useCartStore.getState().updateQuantity(key, 0);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('does not allow quantity to exceed product stock', () => {
    const { addItem } = useCartStore.getState();

    addItem(baseItem);
    addItem(baseItem);
    addItem(baseItem);
    addItem(baseItem);

    const item = useCartStore.getState().items[0];

    expect(item.quantity).toBe(3);

    useCartStore.getState().updateQuantity(item.key, 99);

    expect(useCartStore.getState().items[0].quantity).toBe(3);
  });
});