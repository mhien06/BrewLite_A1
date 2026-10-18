'use client';

import { useMemo, useState } from 'react';

const SIZES = [
  { id: 'S', label: 'Nhỏ', extra: 0 },
  { id: 'M', label: 'Vừa', extra: 5_000 },
  { id: 'L', label: 'Lớn', extra: 10_000 },
] as const;

const TOPPINGS = [
  { id: 'pearls', label: 'Trân châu', price: 8_000 },
  { id: 'cream', label: 'Kem sữa', price: 10_000 },
  { id: 'jelly', label: 'Thạch cà phê', price: 7_000 },
] as const;

interface ProductOptionsProps {
  basePrice: number;
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(price);

export default function ProductOptions({ basePrice }: ProductOptionsProps) {
  const [size, setSize] = useState<(typeof SIZES)[number]['id']>('M');
  const [toppings, setToppings] = useState<string[]>([]);

  const total = useMemo(() => {
    const sizePrice = SIZES.find((item) => item.id === size)?.extra ?? 0;
    const toppingPrice = TOPPINGS.filter((item) => toppings.includes(item.id)).reduce(
      (sum, item) => sum + item.price,
      0,
    );
    return basePrice + sizePrice + toppingPrice;
  }, [basePrice, size, toppings]);

  const toggleTopping = (id: string) => {
    setToppings((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  return (
    <div className="mt-7 space-y-7">
      <fieldset>
        <legend className="text-sm font-bold text-amber-950">Chọn kích cỡ</legend>
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
                onChange={() => setSize(item.id)}
                className="sr-only"
              />
              <span className="block text-base font-extrabold">{item.id}</span>
              <span className="block text-xs">{item.label}</span>
              <span className="mt-1 block text-xs font-semibold">
                {item.extra === 0 ? 'Giá gốc' : `+${formatPrice(item.extra)}`}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-bold text-amber-950">Chọn topping</legend>
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

      <div className="flex items-end justify-between rounded-2xl bg-amber-950 px-5 py-4 text-amber-50">
        <div>
          <p className="text-xs text-amber-200">Tổng giá theo lựa chọn</p>
          <p className="mt-1 text-2xl font-extrabold" aria-live="polite">
            {formatPrice(total)}
          </p>
        </div>
        <span className="rounded-full bg-amber-400/20 px-3 py-1 text-xs font-semibold text-amber-200">
          Size {size}
        </span>
      </div>
    </div>
  );
}
