import { useCheckoutStore } from "@/stores/checkout.store";
import type { CartItem } from "@/types/cart";

const VNPAY_SESSION_KEY = "brewlite_vnpay_checkout";

export interface VnpayCheckoutSession {
  userId: number;
  orderId: number;
  cartFingerprint: string;
  promotionCode: string;
  items: CartItem[];
  cartItems?: CartItem[];
  fromOrderDetails?: boolean;
  idempotencyKey: string;
  txnRef: string;
  expiresAt: string;
}

type SessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const getSessionStorage = (): SessionStorage | null => {
  if (typeof window !== "undefined" && window.sessionStorage) {
    return window.sessionStorage;
  }

  if (typeof sessionStorage !== "undefined") {
    return sessionStorage;
  }

  return null;
};

const isVnpayCheckoutSession = (
  value: unknown,
): value is VnpayCheckoutSession => {
  if (!value || typeof value !== "object") return false;

  const session = value as Partial<VnpayCheckoutSession>;

  return (
    typeof session.userId === "number" &&
    Number.isSafeInteger(session.userId) &&
    session.userId > 0 &&
    typeof session.orderId === "number" &&
    Number.isSafeInteger(session.orderId) &&
    session.orderId > 0 &&
    typeof session.cartFingerprint === "string" &&
    typeof session.promotionCode === "string" &&
    Array.isArray(session.items) &&
    (session.cartItems === undefined || Array.isArray(session.cartItems)) &&
    typeof session.idempotencyKey === "string" &&
    session.idempotencyKey.length > 0 &&
    typeof session.txnRef === "string" &&
    session.txnRef.length > 0 &&
    typeof session.expiresAt === "string" &&
    session.expiresAt.length > 0
  );
};

export const saveVnpayCheckoutSession = (
  session: VnpayCheckoutSession,
): void => {
  getSessionStorage()?.setItem(VNPAY_SESSION_KEY, JSON.stringify(session));
};

export const loadVnpayCheckoutSession = (): VnpayCheckoutSession | null => {
  const storage = getSessionStorage();
  const rawSession = storage?.getItem(VNPAY_SESSION_KEY);

  if (!storage || !rawSession) return null;

  try {
    const session: unknown = JSON.parse(rawSession);

    if (isVnpayCheckoutSession(session)) {
      return session;
    }
  } catch {
    // Xóa snapshot hỏng để không chặn lần checkout tiếp theo.
  }

  storage.removeItem(VNPAY_SESSION_KEY);
  return null;
};

export const clearVnpayCheckoutSession = (): void => {
  getSessionStorage()?.removeItem(VNPAY_SESSION_KEY);
};

export function openVnpayTab(): Window | null {
  // Mở trong thao tác bấm nút để trình duyệt không chặn popup.
  const tab = window.open("about:blank", "_blank");
  if (tab) tab.opener = null;
  return tab;
}

export function vnpayStatusPath(orderId: number, txnRef: string): string {
  const query = new URLSearchParams({
    watch: "1",
    orderId: String(orderId),
    txnRef,
  });
  return `/payment/vnpay-return?${query}`;
}

export function clearCancelledCheckout(orderId: number) {
  const checkout = useCheckoutStore.getState();
  if (checkout.pendingOrder?.orderId === orderId) checkout.clearPendingOrder();
  if (checkout.paymentAttempt?.orderId === orderId) checkout.clearPaymentAttempt();
  if (loadVnpayCheckoutSession()?.orderId === orderId) clearVnpayCheckoutSession();
}
