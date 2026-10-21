'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCartStore } from '@/stores/cart.store';
import type { CartSize, CartSizeId, CartTopping } from '@/types/cart';
import type { Product } from '@/types/product';

const SIZES: CartSize[] = [
  { id: 'S', label: 'Nhỏ', extra: 0 },
  { id: 'M', label: 'Vừa', extra: 5_000 },
  { id: 'L', label: 'Lớn', extra: 10_000 },
];

const TOPPINGS: CartTopping[] = [
  { id: 'pearls', label: 'Trân châu', price: 8_000 },
  { id: 'cream', label: 'Kem sữa', price: 10_000 },
  { id: 'jelly', label: 'Thạch cà phê', price: 7_000 },
];

interface ProductOptionsProps {
  product: Product;
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(price);

export default function ProductOptions({ product }: ProductOptionsProps) {
  const router = useRouter();

  const [size, setSize] = useState<CartSizeId>('M');
  const [toppings, setToppings] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  const addItem = useCartStore((state) => state.addItem);
  const productQuantity = useCartStore((state) =>
    state.items
      .filter((item) => item.productId === product.id)
      .reduce((total, item) => total + item.quantity, 0),
  );

  const selectedSize =
    SIZES.find((item) => item.id === size) ?? SIZES[0];

  const selectedToppings = useMemo(
    () => TOPPINGS.filter((item) => toppings.includes(item.id)),
    [toppings],
  );

  const total = useMemo(
    () =>
      product.price +
      selectedSize.extra +
      selectedToppings.reduce((sum, item) => sum + item.price, 0),
    [product.price, selectedSize.extra, selectedToppings],
  );

  const toggleTopping = (id: string) => {
    setMessage('');
    setToppings((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };

  const handleAddToCart = () => {
    if (product.stock <= 0 || productQuantity >= product.stock) {
      setMessage('Không thể thêm vì đã đạt số lượng tồn kho.');
      return;
    }

    addItem({
      productId: product.id,
      name: product.name,
      imageUrl: product.imageUrl,
      stock: product.stock,
      size: selectedSize,
      toppings: selectedToppings,
      unitPrice: total,
    });

    router.push('/');
  };

  const canAddToCart =
    product.stock > 0 && productQuantity < product.stock;

  return (
    <div className="mt-7 space-y-7">
      <fieldset>
        <legend className="text-sm font-bold text-amber-950">
          Chọn kích cỡ
        </legend>
        <div className="mt-3 grid grid-cols-3 gap-3">
          {SIZES.map((item) => (
            <label
              key={item.id}
              className={`cursor-pointer rounded-xl border px-3 py-3 text-center transition ${
                size === item.id
                  ? 'border-amber-700 bg-amber-100 text-amber-950 ring-2 ring-amber-700/15'
                  : 'border-amber-900/10 bg-white text-stone-700 hover:border-amber-700/40'
              }`}
            >
              <input
                type="radio"
                name="size"
                value={item.id}
                checked={size === item.id}
                onChange={() => {
                  setSize(item.id);
                  setMessage('');
                }}
                className="sr-only"
              />
              <span className="block text-base font-extrabold">{item.id}</span>
              <span className="block text-xs">{item.label}</span>
              <span className="mt-1 block text-xs font-semibold">
                {item.extra === 0
                  ? 'Giá gốc'
                  : `+${formatPrice(item.extra)}`}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-bold text-amber-950">
          Chọn topping
        </legend>
        <div className="mt-3 space-y-2">
          {TOPPINGS.map((item) => (
            <label
              key={item.id}
              className="flex cursor-pointer items-center justify-between rounded-xl border border-amber-900/10 bg-white px-4 py-3 hover:border-amber-700/40"
            >
              <span className="flex items-center gap-3 text-sm font-medium text-stone-800">
                <input
                  type="checkbox"
                  checked={toppings.includes(item.id)}
                  onChange={() => toggleTopping(item.id)}
                  className="h-4 w-4 accent-amber-800"
                />
                {item.label}
              </span>
              <span className="text-sm font-semibold text-amber-800">
                +{formatPrice(item.price)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="rounded-2xl bg-amber-950 px-5 py-4 text-amber-50">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-amber-200">
              Tổng giá theo lựa chọn
            </p>
            <p className="mt-1 text-2xl font-extrabold" aria-live="polite">
              {formatPrice(total)}
            </p>
          </div>
          <span className="rounded-full bg-amber-400/20 px-3 py-1 text-xs font-semibold text-amber-200">
            Size {size}
          </span>
        </div>

        <button
          type="button"
          onClick={handleAddToCart}
          disabled={!canAddToCart}
          className="mt-4 w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-extrabold text-amber-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-stone-500 disabled:text-stone-200"
        >
          {canAddToCart ? 'Thêm vào giỏ hàng' : 'Không thể thêm sản phẩm'}
        </button>

        {message && (
          <p
            className="mt-3 text-center text-sm font-semibold text-amber-100"
            aria-live="polite"
          >
            {message}
          </p>
        )}
      </div>
    </div>
  );
}