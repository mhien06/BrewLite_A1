import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearVnpayCheckoutSession,
  loadVnpayCheckoutSession,
  saveVnpayCheckoutSession,
  type VnpayCheckoutSession,
} from "@/utils/vnpay-session";

const values = new Map<string, string>();

const sessionStorageMock = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
};

describe("VNPAY checkout session", () => {
  beforeEach(() => {
    values.clear();
    vi.stubGlobal("sessionStorage", sessionStorageMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves, loads and clears a checkout snapshot", () => {
    const session: VnpayCheckoutSession = {
      userId: 1,
      orderId: 10,
      cartFingerprint: "cart-1",
      promotionCode: "BREW10",
      items: [],
      idempotencyKey: "vnpay-key",
      txnRef: "BL123",
      expiresAt: "2026-11-05T11:00:00.000Z",
    };

    saveVnpayCheckoutSession(session);

    expect(loadVnpayCheckoutSession()).toEqual(session);

    clearVnpayCheckoutSession();

    expect(loadVnpayCheckoutSession()).toBeNull();
  });

  it("removes a malformed checkout snapshot", () => {
    sessionStorageMock.setItem(
      "brewlite_vnpay_checkout",
      JSON.stringify({ orderId: "invalid" }),
    );

    expect(loadVnpayCheckoutSession()).toBeNull();
    expect(values.size).toBe(0);
  });
});
