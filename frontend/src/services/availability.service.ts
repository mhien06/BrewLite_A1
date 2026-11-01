import type { CartItem, CartSize, CartTopping } from "@/types/cart";
import type { CartAvailability, StockRequestItem } from "@/types/availability";

export const DRINK_SIZES: CartSize[] = [
  { id: "S", label: "Nhỏ", extra: 0 },
  { id: "M", label: "Vừa", extra: 5000 },
  { id: "L", label: "Lớn", extra: 10000 },
];
export const DRINK_TOPPINGS: CartTopping[] = [
  { id: "pearls", label: "Trân châu", price: 8000 },
  { id: "cream", label: "Kem sữa", price: 10000 },
  { id: "jelly", label: "Thạch cà phê", price: 7000 },
];

export function cartRequestItems(items: CartItem[]) {
  return items.map((item) => ({
    productId: item.productId,
    size: item.size.id,
    quantity: item.quantity,
    toppings: item.toppings.map((topping) => topping.id),
  }));
}

export async function checkCartAvailability(
  items: CartItem[],
  signal?: AbortSignal,
): Promise<CartAvailability> {
  return checkInventoryItems(cartRequestItems(items), signal);
}

export async function checkInventoryItems(
  items: StockRequestItem[],
  signal?: AbortSignal,
): Promise<CartAvailability> {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  const response = await fetch(
    `${base.replace(/\/$/, "")}/inventory/check-cart`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal,
      body: JSON.stringify({ items }),
    },
  );
  if (!response.ok)
    throw new Error("Không kiểm tra được tình trạng món. Vui lòng thử lại.");
  return response.json();
}

// Gộp các dòng có cùng món, size và topping sau khi sửa trong giỏ.
export function mergeCartLines(items: CartItem[]): CartItem[] {
  const merged = new Map<string, CartItem>();
  for (const item of items) {
    const key = `${item.productId}:${item.size.id}:${item.toppings
      .map((t) => t.id)
      .sort()
      .join(",")}`;
    const existing = merged.get(key);
    merged.set(key, {
      ...item,
      key,
      quantity: (existing?.quantity ?? 0) + item.quantity,
    });
  }
  return [...merged.values()];
}
