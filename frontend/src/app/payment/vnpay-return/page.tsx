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

      if (!checkoutSession) {
        setReturnState("error");
        setMessage("Không tìm thấy phiên thanh toán VNPAY.");
        return;
      }

      if (
        valid !== "true" ||
        !Number.isSafeInteger(orderId) ||
        orderId <= 0 ||
        !txnRef ||
        checkoutSession.userId !== user.id ||
        checkoutSession.orderId !== orderId ||
        checkoutSession.txnRef !== txnRef
      ) {
        setReturnState("error");
        setMessage(
          "Thông tin VNPAY trả về không hợp lệ hoặc không khớp phiên thanh toán.",
        );
        return;
      }

      // Khôi phục dữ liệu trước khi kiểm tra trạng thái thật từ backend.
      useCartStore.setState({
        items: checkoutSession.items,
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

      try {
        const order = await getOrderByIdApi(token, orderId);

        if (ignore) return;

        if (PAID_STATUSES.includes(order.status)) {
          useCartStore.getState().clearCart();
          useCheckoutStore.getState().clearPendingOrder();
          useCheckoutStore.getState().clearPaymentAttempt();
          clearVnpayCheckoutSession();

          setReturnState("paid");
          setMessage("Thanh toán VNPAY đã được xác nhận.");
          return;
        }

        if (order.status === "PAYMENT_FAILED" || order.status === "CANCELLED") {
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
        setMessage("Backend chưa nhận được xác nhận cuối cùng từ VNPAY.");
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
  ]);

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-16 text-center">
      <section className="rounded-[24px] border border-[#ead8c7] bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-extrabold text-[#40241b]">
          Kết quả thanh toán VNPAY
        </h1>

        {returnState === "checking" && (
          <div className="mx-auto mt-6 h-12 w-12 animate-spin rounded-full border-4 border-amber-600 border-t-transparent" />
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
            href="/checkout"
            className="mt-6 inline-flex rounded-full bg-[#f6a14a] px-7 py-3 text-sm font-bold text-[#40241b]"
          >
            Thử thanh toán lại
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
              href="/checkout"
              className="rounded-full border border-[#ead8c7] px-6 py-3 text-sm font-bold text-[#40241b]"
            >
              Về thanh toán
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
