"use client";
import { useEffect, useState } from "react";
import type { CartItem } from "@/types/cart";
import type { CartAvailability, StockRequestItem } from "@/types/availability";
import {
  cartRequestItems,
  checkInventoryItems,
} from "@/services/availability.service";

// Tải lại khi giỏ đổi, quay lại cửa sổ hoặc sau 15 giây. Không giữ chỗ trong kho.
export function useCartAvailability(items: CartItem[]) {
  const fingerprint = JSON.stringify(cartRequestItems(items));
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    fingerprint: string;
    result: CartAvailability | null;
    error: string;
  }>({ fingerprint: "", result: null, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    // Chỉ gửi các trường mà API cần; không phụ thuộc giá hay nhãn hiển thị.
    const requestItems = JSON.parse(fingerprint) as StockRequestItem[];
    checkInventoryItems(requestItems, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted)
          setState({ fingerprint, result, error: "" });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            fingerprint,
            result: null,
            error:
              error instanceof Error
                ? error.message
                : "Không kiểm tra được món.",
          });
      });
    return () => controller.abort();
  }, [fingerprint, revision]);
  useEffect(() => {
    const reload = () => setRevision((value) => value + 1);
    window.addEventListener("focus", reload);
    const timer = window.setInterval(reload, 15000);
    return () => {
      window.removeEventListener("focus", reload);
      window.clearInterval(timer);
    };
  }, []);
  return {
    result: state.fingerprint === fingerprint ? state.result : null,
    error: state.fingerprint === fingerprint ? state.error : "",
    refresh: () => setRevision((value) => value + 1),
  };
}
