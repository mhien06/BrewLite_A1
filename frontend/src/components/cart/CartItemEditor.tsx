"use client";
import { useState } from "react";
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
  const [sizeId, setSizeId] = useState<CartSizeId>(item.size.id);
  const [toppingIds, setToppingIds] = useState(
    item.toppings.map((topping) => topping.id),
  );
  const size = DRINK_SIZES.find((size) => size.id === sizeId)!;
  const toppings = DRINK_TOPPINGS.filter((topping) =>
    toppingIds.includes(topping.id),
  );
  const basePrice =
    item.unitPrice -
    item.size.extra -
    item.toppings.reduce((sum, topping) => sum + topping.price, 0);
  const changed: CartItem = {
    ...item,
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

  function toggle(code: string) {
    setToppingIds((ids) =>
      ids.includes(code) ? ids.filter((id) => id !== code) : [...ids, code],
    );
  }

  return (
    <section
      aria-label={`Sửa lựa chọn ${item.name}`}
      className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-5"
    >
      <h3 className="font-bold text-amber-950">
        Sửa size và topping · {item.name}
      </h3>
      <fieldset className="mt-4" disabled={busy}>
        <legend className="mb-2 text-sm font-semibold">Kích cỡ</legend>
        <div className="flex gap-3">
          {DRINK_SIZES.map((option) => (
            <label
              key={option.id}
              className="rounded-lg border bg-white px-4 py-2 text-sm"
            >
              <input
                type="radio"
                name={`edit-size-${item.key}`}
                checked={sizeId === option.id}
                onChange={() => setSizeId(option.id)}
                className="mr-2"
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
        <div className="space-y-2">
          {DRINK_TOPPINGS.map((option) => {
            const stock = current?.toppings.find(
              (topping) => topping.code === option.id,
            );
            const checked = toppingIds.includes(option.id);
            const disabled =
              !checked && (!stock || stock.maxQuantity < item.quantity);
            const hint = !stock
              ? "Đang kiểm tra..."
              : stock.stockQuantity < 1
                ? "Hết topping"
                : stock.maxQuantity < item.quantity
                  ? `Chỉ đủ tối đa ${stock.maxQuantity} ly theo lựa chọn này`
                  : "";
            return (
              <label
                key={option.id}
                className={`flex flex-wrap items-center gap-2 rounded-lg border bg-white p-3 text-sm ${disabled ? "text-stone-400" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(option.id)}
                />
                {option.label}
                {hint && <span className="text-xs">· {hint}</span>}
              </label>
            );
          })}
        </div>
      </fieldset>
      {(availability.error || current?.message) && (
        <p role="status" className="mt-3 text-sm text-red-700">
          {availability.error || current?.message}
        </p>
      )}
      <p className="mt-3 text-sm">
        Giá mỗi ly: {changed.unitPrice.toLocaleString("vi-VN")} đ
      </p>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          disabled={busy || !current}
          onClick={() => onSave(changed)}
          className="rounded-xl bg-amber-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Lưu lựa chọn
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
