"use client";
import { DRINK_TOPPINGS } from "@/services/availability.service";
import type { CartAvailability } from "@/types/availability";

type Props = {
  ids: string[];
  onChange: (ids: string[]) => void;
  stock?: CartAvailability["items"][number];
  cups: number;
  busy: boolean;
};

// Mỗi mã lặp lại là một phần topping trên MỖI ly. Ví dụ [jelly, jelly] = 2 phần.
export default function ToppingCounter({
  ids,
  onChange,
  stock,
  cups,
  busy,
}: Props) {
  return (
    <div className="space-y-3">
      {DRINK_TOPPINGS.map((option) => {
        const count = ids.filter((id) => id === option.id).length;
        const available = stock?.toppings.find((t) => t.code === option.id);
        const canIncrease = Boolean(
          available && available.maxQuantity >= cups && ids.length < 30,
        );
        return (
          <div
            key={option.id}
            className="flex items-center justify-between gap-4 rounded-2xl border border-[#ead8c7] bg-white px-4 py-3"
          >
            <div>
              <p className="text-sm font-semibold text-[#492214]">
                {option.label}
              </p>
              <p className="mt-1 text-xs text-stone-500">
                {option.price.toLocaleString("vi-VN")} đ / phần
              </p>
              {available && !canIncrease && (
                <p className="mt-1 text-xs text-amber-800">
                  {available.stockQuantity < 1
                    ? "Tạm hết topping"
                    : "Không thể thêm phần này"}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center rounded-full border border-[#ead8c7] bg-[#fffaf5] p-1">
              <button
                type="button"
                aria-label={`Giảm phần ${option.label}`}
                disabled={busy || count === 0}
                onClick={() => {
                  const next = [...ids];
                  next.splice(next.indexOf(option.id), 1);
                  onChange(next);
                }}
                className="h-8 w-8 rounded-full font-bold hover:bg-amber-100 disabled:text-stone-300"
              >
                −
              </button>
              <span
                className="w-7 text-center text-sm font-bold"
                aria-label={`Số phần ${option.label}`}
              >
                {count}
              </span>
              <button
                type="button"
                aria-label={`Tăng phần ${option.label}`}
                disabled={busy || !canIncrease}
                onClick={() => onChange([...ids, option.id])}
                className="h-8 w-8 rounded-full font-bold hover:bg-amber-100 disabled:text-stone-300"
              >
                +
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
