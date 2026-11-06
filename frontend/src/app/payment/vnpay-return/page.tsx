"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getOrderByIdApi, OrdersServiceError } from "@/services/orders.service";
import { useAuthStore } from "@/stores/auth.store";
import { useCartStore } from "@/stores/cart.store";
import { useCheckoutStore } from "@/stores/checkout.store";
import type { OrderStatus } from "@/types/order";
import {
  clearVnpayCheckoutSession,
  loadVnpayCheckoutSession,
} from "@/utils/vnpay-session";

type ReturnState = "checking" | "paid" | "failed" | "pending" | "error";

const PAID_STATUSES: OrderStatus[] = [
  "PAID",
  "PREPARING",
  "READY",
  "COMPLETED",
];

function VnpayReturnContent() {
  const searchParams = useSearchParams();
  const valid = searchParams.get("valid");
  const watching = searchParams.get("watch") === "1";
  const rawOrderId = searchParams.get("orderId");
  const txnRef = searchParams.get("txnRef");

  const orderId =
    rawOrderId && /^[1-9]\d*$/.test(rawOrderId) ? Number(rawOrderId) : NaN;

  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const logout = useAuthStore((state) => state.logout);

  const [returnState, setReturnState] = useState<ReturnState>("checking");
  const [message, setMessage] = useState("Đang kiểm tra kết quả thanh toán...");
  const [refreshKey, setRefreshKey] = useState(0);
  const hasOrderId = Number.isSafeInteger(orderId) && orderId > 0;
  const orderDetailsPath = `/order-confirmation?orderId=${orderId}`;

  useEffect(() => {
    let ignore = false;

    if (isAuthLoading) {
      return;
    }

    const checkPayment = async () => {
      setReturnState("checking");
      setMessage("Đang kiểm tra kết quả thanh toán...");

      if (!isAuthenticated || !token || !user) {
        setReturnState("error");
        setMessage("Vui lòng đăng nhập để kiểm tra thanh toán.");
        return;
      }

      const checkoutSession = loadVnpayCheckoutSession();

      const matchingSession =
        checkoutSession?.userId === user.id &&
        checkoutSession.orderId === orderId &&
        checkoutSession.txnRef === txnRef;

      if (!hasOrderId || !txnRef || (!watching && valid !== "true")) {
        setReturnState("error");
        setMessage(
          "Thông tin VNPAY trả về không hợp lệ hoặc không khớp phiên thanh toán.",
        );
        return;
      }

      if (
        matchingSession &&
        checkoutSession.fromOrderDetails &&
        !useCartStore.getState().items.length
      ) {
        useCartStore.setState({ items: checkoutSession.cartItems ?? [] });
      }
      if (matchingSession && !checkoutSession.fromOrderDetails) {
        const currentItems = useCartStore.getState().items;
        const restoredItems = currentItems.length
          ? currentItems
          : (checkoutSession.cartItems ?? checkoutSession.items);
        const purchasedKeys = new Set(
          checkoutSession.items.map((item) => item.key),
        );
        useCartStore.setState({
          items: restoredItems,
          excludedKeys: restoredItems
            .filter((item) => !purchasedKeys.has(item.key))
            .map((item) => item.key),
        });

        useCheckoutStore
          .getState()
          .setPendingOrder(user.id, orderId, checkoutSession.cartFingerprint);

        useCheckoutStore
          .getState()
          .restoreVnpayPaymentAttempt(
            user.id,
            orderId,
            checkoutSession.idempotencyKey,
          );
      }

      try {
        const order = await getOrderByIdApi(token, orderId);

        if (ignore) return;

        if (PAID_STATUSES.includes(order.status)) {
          if (matchingSession) {
            useCartStore.getState().removePurchasedItems(checkoutSession.items);
            if (useCheckoutStore.getState().pendingOrder?.orderId === orderId)
              useCheckoutStore.getState().clearPendingOrder();
            useCheckoutStore.getState().clearPaymentAttempt();
            clearVnpayCheckoutSession();
          }

          setReturnState("paid");
          setMessage("Thanh toán VNPAY đã được xác nhận.");
          return;
        }

        if (order.status === "PAYMENT_FAILED" || order.status === "CANCELLED") {
          if (matchingSession)
            useCheckoutStore.getState().clearPaymentAttempt();

          setReturnState("failed");
          setMessage(
            order.status === "CANCELLED"
              ? "Đơn hàng đã bị hủy. Giỏ hàng vẫn được giữ lại."
              : "Thanh toán chưa thành công. Bạn có thể thử lại.",
          );
          return;
        }

        setReturnState("pending");
        setMessage(
          "Chờ thanh toán. Trang này sẽ tự kiểm tra kết quả từ VNPAY.",
        );
      } catch (error) {
        if (ignore) return;

        if (error instanceof OrdersServiceError && error.status === 401) {
          logout();
          setMessage("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        } else {
          setMessage(
            error instanceof Error
              ? error.message
              : "Không thể kiểm tra trạng thái đơn hàng.",
          );
        }

        setReturnState("error");
      }
    };

    void checkPayment();

    return () => {
      ignore = true;
    };
  }, [
    isAuthLoading,
    isAuthenticated,
    token,
    user,
    valid,
    orderId,
    txnRef,
    logout,
    refreshKey,
    watching,
    hasOrderId,
  ]);

  useEffect(() => {
    if (returnState !== "pending") return;
    const timer = window.setTimeout(
      () => setRefreshKey((value) => value + 1),
      3000,
    );
    return () => window.clearTimeout(timer);
  }, [returnState]);

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-16 text-center">
      <section className="rounded-[24px] border border-[#ead8c7] bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-extrabold text-[#40241b]">
          {returnState === "pending"
            ? "Chờ thanh toán VNPAY"
            : "Kết quả thanh toán VNPAY"}
        </h1>

        {returnState === "checking" && (
          <div className="mx-auto mt-6 h-12 w-12 animate-spin rounded-full border-4 border-amber-600 border-t-transparent" />
        )}

        {Number.isSafeInteger(orderId) && (
          <p className="mt-3 text-sm">Đơn #{orderId}</p>
        )}
        <p className="mt-5 text-sm font-semibold text-[#7a5a4b]">{message}</p>

        {returnState === "paid" && (
          <Link
            href={`/order-confirmation?orderId=${orderId}`}
            className="mt-6 inline-flex rounded-full bg-emerald-600 px-7 py-3 text-sm font-bold text-white"
          >
            Xem đơn hàng
          </Link>
        )}

        {returnState === "failed" && (
          <Link
            href={orderDetailsPath}
            className="mt-6 inline-flex rounded-full bg-[#f6a14a] px-7 py-3 text-sm font-bold text-[#40241b]"
          >
            Xem chi tiết đơn
          </Link>
        )}

        {returnState === "pending" && (
          <button
            type="button"
            onClick={() => setRefreshKey((value) => value + 1)}
            className="mt-6 rounded-full bg-[#f6a14a] px-7 py-3 text-sm font-bold text-[#40241b]"
          >
            Kiểm tra lại
          </button>
        )}

        {returnState === "error" && (
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href={hasOrderId ? orderDetailsPath : "/checkout"}
              className="rounded-full border border-[#ead8c7] px-6 py-3 text-sm font-bold text-[#40241b]"
            >
              {hasOrderId ? "Xem chi tiết đơn" : "Về thanh toán"}
            </Link>

            {!isAuthenticated && (
              <Link
                href="/login"
                className="rounded-full bg-[#f6a14a] px-6 py-3 text-sm font-bold text-[#40241b]"
              >
                Đăng nhập
              </Link>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

export default function VnpayReturnPage() {
  return (
    <Suspense
      fallback={
        <main className="px-4 py-16 text-center">
          Đang tải kết quả VNPAY...
        </main>
      }
    >
      <VnpayReturnContent />
    </Suspense>
  );
}
