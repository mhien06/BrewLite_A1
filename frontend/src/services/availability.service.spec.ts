import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRINK_SIZES,
  DRINK_TOPPINGS,
  mergeCartLines,
  checkCartAvailability,
} from "./availability.service";
import { useCartStore } from "@/stores/cart.store";
import type { CartItem } from "@/types/cart";

const item: CartItem = {
  key: "old",
  productId: 1,
  name: "Cà phê",
  imageUrl: "",
  stock: 1,
  size: DRINK_SIZES[0],
  toppings: [],
  unitPrice: 29000,
  quantity: 1,
};
describe("Lưu giỏ sau khi kiểm tra size/topping", () => {
  beforeEach(() => {
    useCartStore.getState().clearCart();
    vi.unstubAllGlobals();
  });
  it("đổi cấu hình trùng thì gộp số lượng, khác size vẫn là dòng riêng", () => {
    const result = mergeCartLines([
      item,
      { ...item, quantity: 2 },
      { ...item, size: DRINK_SIZES[1] },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].quantity).toBe(3);
  });
  it("thứ tự topping không làm tạo dòng giỏ trùng", () => {
    const a = { ...item, toppings: [DRINK_TOPPINGS[0], DRINK_TOPPINGS[1]] };
    const b = { ...item, toppings: [DRINK_TOPPINGS[1], DRINK_TOPPINGS[0]] };
    expect(mergeCartLines([a, b])).toHaveLength(1);
  });
  it("không phục hồi giỏ cũ nếu khách đã xóa trong lúc kiểm tra", () => {
    const previous = useCartStore.getState().items;
    useCartStore.getState().clearCart();
    expect(useCartStore.getState().applyCheckedItems(previous, [item])).toBe(
      false,
    );
    expect(useCartStore.getState().items).toHaveLength(0);
  });
  it("kết quả đã kiểm tra không bị giới hạn bởi stock size S cũ", () => {
    const previous = useCartStore.getState().items;
    expect(
      useCartStore
        .getState()
        .applyCheckedItems(previous, [{ ...item, quantity: 3 }]),
    ).toBe(true);
    expect(useCartStore.getState().items[0].quantity).toBe(3);
  });
  it("chỉ gửi trường public cho API, không gửi giá hoặc tồn từ trình duyệt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ available: true, items: [] }),
      });
    vi.stubGlobal("fetch", fetchMock);
    await checkCartAvailability([item]);
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload).toEqual({
      items: [{ productId: 1, size: "S", quantity: 1, toppings: [] }],
    });
  });
});
