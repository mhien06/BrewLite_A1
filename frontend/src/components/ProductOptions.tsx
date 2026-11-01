"use client";

import { useRef, useState } from "react";
import ToppingCounter from "@/components/ToppingCounter";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/stores/cart.store";
import type { CartSizeId, CartItem } from "@/types/cart";
import {
  DRINK_SIZES as SIZES,
  DRINK_TOPPINGS as TOPPINGS,
  checkCartAvailability,
  mergeCartLines,
} from "@/services/availability.service";
import { useCartAvailability } from "@/hooks/useCartAvailability";
import type { Product } from "@/types/product";

interface ProductOptionsProps {
  product: Product;
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(price);

export default function ProductOptions({ product }: ProductOptionsProps) {
  const router = useRouter();

  const [size, setSize] = useState<CartSizeId>("M");
  const [toppings, setToppings] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  const items = useCartStore((state) => state.items);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const selectedSize = SIZES.find((item) => item.id === size) ?? SIZES[0];
  const selectedToppings = toppings.map((id) =>
    TOPPINGS.find((item) => item.id === id)!,
  );
  const total =
    product.price +
    selectedSize.extra +
    selectedToppings.reduce((sum, topping) => sum + topping.price, 0);
  const draft: CartItem = {
    key: "preview",
    productId: product.id,
    name: product.name,
    imageUrl: product.imageUrl,
    stock: product.stock,
    size: selectedSize,
    toppings: selectedToppings,
    unitPrice: total,
    quantity: 1,
  };
  const availability = useCartAvailability([...items, draft]);
  const current = availability.result?.items[items.length];
  const canAddToCart = Boolean(availability.result?.available) && !busy;

  async function handleAddToCart() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setMessage("");
    const before = useCartStore.getState().items;
    try {
      const next = mergeCartLines([...before, draft]);
      const checked = await checkCartAvailability(next);
      if (!checked.available) {
        setMessage(
          checked.items.find((item) => item.message)?.message ||
            "Vui lòng kiểm tra lại giỏ hàng.",
        );
        availability.refresh();
        return;
      }
      if (!useCartStore.getState().applyCheckedItems(before, next)) {
        setMessage("Giỏ hàng vừa thay đổi. Vui lòng thử lại.");
        return;
      }
      router.push("/");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Không kiểm tra được món.",
      );
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }

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
                  ? "border-amber-700 bg-amber-100 text-amber-950 ring-2 ring-amber-700/15"
                  : "border-amber-900/10 bg-white text-stone-700 hover:border-amber-700/40"
              }`}
            >
              <input
                type="radio"
                name="size"
                value={item.id}
                checked={size === item.id}
                disabled={busy}
                onChange={() => {
                  setSize(item.id);
                  setMessage("");
                }}
                className="sr-only"
              />
              <span className="block text-base font-extrabold">{item.id}</span>
              <span className="block text-xs">{item.label}</span>
              <span className="mt-1 block text-xs font-semibold">
                {item.extra === 0 ? "Giá gốc" : `+${formatPrice(item.extra)}`}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-bold text-amber-950">
          Chọn topping
        </legend>
        <div className="mt-3">
          <ToppingCounter
            ids={toppings}
            onChange={(ids) => {
              setToppings(ids);
              setMessage("");
            }}
            stock={current}
            cups={1}
            busy={busy}
          />
        </div>
      </fieldset>

      <div className="rounded-2xl bg-amber-950 px-5 py-4 text-amber-50">
        <div className="flex items-end justify-between">
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

        <button
          type="button"
          onClick={handleAddToCart}
          disabled={!canAddToCart}
          className="mt-4 w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-extrabold text-amber-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-stone-500 disabled:text-stone-200"
        >
          {busy ? "Đang kiểm tra..." : "Thêm vào giỏ hàng"}
        </button>

        <p className="mt-3 text-sm text-amber-100" role="status">
          {availability.error ||
            (availability.result
              ? current?.message ||
                (availability.result.available
                  ? ""
                  : "Giỏ hiện tại có món cần sửa.")
              : "Đang kiểm tra tình trạng món...")}
        </p>
        {availability.error && (
          <button
            type="button"
            onClick={availability.refresh}
            className="mt-2 underline"
          >
            Thử lại
          </button>
        )}
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
