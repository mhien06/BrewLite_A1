"use client";
import { useState } from "react";
import ToppingCounter from "@/components/ToppingCounter";
import type { CartItem, CartSizeId } from "@/types/cart";
import { DRINK_SIZES, DRINK_TOPPINGS } from "@/services/availability.service";
import { useCartAvailability } from "@/hooks/useCartAvailability";

type Props = {
  item: CartItem;
  items: CartItem[];
  busy: boolean;
  onSave: (item: CartItem) => Promise<void>;
  onClose: () => void;
};

export default function CartItemEditor({
  item,
  items,
  busy,
  onSave,
  onClose,
}: Props) {
  const [quantity, setQuantity] = useState(item.quantity);
  const [sizeId, setSizeId] = useState<CartSizeId>(item.size.id);
  const [toppingIds, setToppingIds] = useState(
    item.toppings.map((topping) => topping.id),
  );
  const size = DRINK_SIZES.find((size) => size.id === sizeId)!;
  const toppings = toppingIds.map((id) =>
    DRINK_TOPPINGS.find((t) => t.id === id)!,
  );
  const basePrice =
    item.unitPrice -
    item.size.extra -
    item.toppings.reduce((sum, topping) => sum + topping.price, 0);
  const changed: CartItem = {
    ...item,
    quantity,
    size,
    toppings,
    unitPrice:
      basePrice +
      size.extra +
      toppings.reduce((sum, topping) => sum + topping.price, 0),
  };
  const index = items.findIndex((line) => line.key === item.key);
  const preview = items.map((line) => (line.key === item.key ? changed : line));
  const availability = useCartAvailability(preview);
  const current = availability.result?.items[index];

  return (
    <section
      aria-label={`Sửa lựa chọn ${item.name}`}
      className="mt-3 rounded-[22px] border border-[#ead8c7] bg-[#fffaf5] p-5 sm:p-6"
    >
      <h3 className="font-bold text-amber-950">
        Cập nhật sản phẩm · {item.name}
      </h3>
      <div className="mt-4 flex items-center justify-between gap-4">
        <span className="text-sm font-semibold">Số lượng ly</span>
        <div className="flex items-center rounded-full border border-[#ead8c7] bg-white p-1">
          <button type="button" aria-label="Giảm số ly trong lựa chọn" disabled={busy || quantity <= 1} onClick={() => setQuantity(value => Math.max(1, value - 1))} className="h-9 w-9 rounded-full font-bold hover:bg-amber-50 disabled:cursor-not-allowed disabled:text-stone-300">−</button>
          <span className="min-w-8 text-center text-sm font-bold" aria-label="Số ly trong lựa chọn">{quantity}</span>
          <button type="button" aria-label="Tăng số ly trong lựa chọn" disabled={busy || !current || quantity >= current.maxQuantity} onClick={() => setQuantity(value => value + 1)} className="h-9 w-9 rounded-full font-bold hover:bg-amber-50 disabled:cursor-not-allowed disabled:text-stone-300">+</button>
        </div>
      </div>
      <fieldset className="mt-4" disabled={busy}>
        <legend className="mb-2 text-sm font-semibold">Kích cỡ</legend>
        <div className="flex gap-3">
          {DRINK_SIZES.map((option) => (
            <label
              key={option.id}
              className="cursor-pointer rounded-xl border border-[#ead8c7] bg-white px-5 py-3 text-sm font-semibold"
            >
              <input
                type="radio"
                name={`edit-size-${item.key}`}
                checked={sizeId === option.id}
                onChange={() => setSizeId(option.id)}
                className="mr-2 accent-amber-800"
              />
              {option.id}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-4" disabled={busy}>
        <legend className="mb-2 text-sm font-semibold">
          Topping cho mỗi ly
        </legend>
        <ToppingCounter
          ids={toppingIds}
          onChange={setToppingIds}
          stock={current}
          cups={quantity}
          busy={busy}
        />
      </fieldset>
      {(availability.error || current?.message) && (
        <p role="status" className="mt-3 text-sm text-red-700">
          {availability.error || current?.message}
        </p>
      )}
      <p className="mt-3 text-sm">
        Giá mỗi ly: {changed.unitPrice.toLocaleString("vi-VN")} đ
      </p>
      <p className="mt-1 text-sm font-semibold">Tổng: {(changed.unitPrice * quantity).toLocaleString("vi-VN")} đ</p>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          disabled={busy || !current || Boolean(current.message)}
          onClick={() => onSave(changed)}
          className="rounded-xl bg-amber-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Cập nhật
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="rounded-xl border px-4 py-2 text-sm"
        >
          Đóng
        </button>
      </div>
    </section>
  );
}
