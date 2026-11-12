"use client";

import { formatToppingLabels } from "@/utils/toppings";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  cancelOrderApi,
  getOrderByIdApi,
  OrdersServiceError,
} from "@/services/orders.service";
import { useCartStore } from "@/stores/cart.store";
import { useAuthStore } from "@/stores/auth.store";
import {
  createPaymentApi,
  createVnpayPaymentUrlApi,
} from "@/services/checkout.service";
import {
  clearVnpayCheckoutSession,
  clearCancelledCheckout,
  openVnpayTab,
  vnpayStatusPath,
  loadVnpayCheckoutSession,
  saveVnpayCheckoutSession,
} from "@/utils/vnpay-session";
import type { PaymentMethod } from "@/types/checkout";
import type { Order, OrderStatus, RefundStatus } from "@/types/order";
import { loginHref } from "@/utils/login-redirect";

const formatPrice = (price: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(price);

const formatDate = (dateStr: string) => {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
};

const refundStatusLabels: Record<RefundStatus, string> = {
  PENDING: "Hoàn tiền đang chờ xử lý",
  PROCESSING: "VNPay đang xử lý hoàn tiền",
  SUCCEEDED: "VNPay đã xác nhận hoàn tiền",
  FAILED: "VNPay từ chối hoàn tiền",
  NEEDS_REVIEW: "Đang đối soát với VNPay",
};

const TOPPING_LABELS: Record<string, string> = {
  pearls: "Trân châu",
  cream: "Kem sữa",
  jelly: "Thạch cà phê",
};

const formatTopping = (toppingId: string) =>
  TOPPING_LABELS[toppingId] || toppingId;

const getStatusConfig = (status: OrderStatus) => {
  switch (status) {
    case "PAID":
      return {
        icon: "✓",
        iconColor: "text-emerald-600",
        title: "Thanh toán thành công",
        subtitle:
          "Quán chưa xác nhận đơn. Bạn vẫn có thể hủy trước khi barista nhận pha.",
        badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
        badgeLabel: "PAID (Chờ quán xác nhận)",
      };
    case "PENDING":
      return {
        icon: "⏳",
        iconColor: "text-amber-600",
        title: "Đơn hàng đang chờ thanh toán",
        subtitle:
          "Đơn hàng đã được lưu trên hệ thống và đang chờ hoàn tất thanh toán.",
        badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
        badgeLabel: "PENDING (Chờ thanh toán)",
      };
    case "PAYMENT_FAILED":
      return {
        icon: "⚠️",
        iconColor: "text-rose-600",
        title: "Thanh toán không thành công",
        subtitle:
          "Giao dịch thanh toán chưa hoàn tất. Bạn có thể kiểm tra lại số dư hoặc thử lại.",
        badgeClass: "bg-rose-50 text-rose-700 border-rose-200",
        badgeLabel: "PAYMENT_FAILED (Thất bại)",
      };
    default:
      return {
        icon: "📋",
        iconColor: "text-stone-600",
        title: "Chi tiết đơn hàng",
        subtitle: "Thông tin chi tiết đơn hàng của bạn.",
        badgeClass: "bg-stone-50 text-stone-700 border-stone-200",
        badgeLabel: status,
      };
  }
};

const resolveDefaultRetryMethod = (order: Order | null): PaymentMethod => {
  if (
    order?.paymentMethod === "WALLET" ||
    order?.paymentMethod === "CARD" ||
    order?.paymentMethod === "VNPAY"
  ) {
    return order.paymentMethod;
  }
  const hasPendingVnpay = order?.payments?.some(
    (payment) =>
      payment.method === "VNPAY" &&
      payment.status === "PENDING" &&
      Boolean(payment.expiresAt),
  );
  return hasPendingVnpay ? "VNPAY" : "WALLET";
};

function OrderConfirmationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawOrderId = searchParams.get("orderId");
  const orderId =
    rawOrderId && /^[1-9]\d*$/.test(rawOrderId) ? Number(rawOrderId) : NaN;
  const isInvalidId =
    !rawOrderId || !Number.isSafeInteger(orderId) || orderId <= 0;

  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const logout = useAuthStore((state) => state.logout);

  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(!isInvalidId);
  const [error, setError] = useState<string | null>(null);

  const [methodOverride, setMethodOverride] = useState<{
    orderId: number;
    method: PaymentMethod;
  } | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const retryMethod =
    methodOverride && methodOverride.orderId === order?.id
      ? methodOverride.method
      : resolveDefaultRetryMethod(order);

  async function cancelOrder() {
    if (!token || !order || cancelling || retrying) return;
    const waitingConfirm = order.status === "PAID";
    if (
      !window.confirm(
        waitingConfirm
          ? "Quán chưa xác nhận đơn này. Bạn muốn hủy?"
          : "Bạn muốn hủy đơn này?",
      )
    )
      return;

    setCancelling(true);
    setRetryError("");
    try {
      await cancelOrderApi(token, order.id);
      clearCancelledCheckout(order.id);
      setOrder(await getOrderByIdApi(token, order.id));
    } catch (error) {
      setRetryError(
        error instanceof Error ? error.message : "Không thể hủy đơn.",
      );
    } finally {
      setCancelling(false);
    }
  }

  const retryInFlight = useRef(false);

  async function retryPayment() {
    if (
      !order ||
      !token ||
      !user ||
      retryInFlight.current ||
      (order.status !== "PAYMENT_FAILED" && order.status !== "PENDING")
    )
      return;

    const paymentTab = retryMethod === "VNPAY" ? openVnpayTab() : null;
    let redirected = false;
    retryInFlight.current = true;
    setRetrying(true);
    setRetryError("");
    const key = crypto.randomUUID();

    try {
      if (retryMethod !== "VNPAY") {
        const result = await createPaymentApi(
          token,
          { orderId: order.id, method: retryMethod, simulateSuccess: true },
          key,
        );
        if (useAuthStore.getState().user?.id !== user.id) return;

        if (result.status === "PAID") {
          const session = loadVnpayCheckoutSession();
          if (session?.orderId === order.id && session.userId === user.id) {
            useCartStore.getState().removePurchasedItems(session.items);
            clearVnpayCheckoutSession();
          }
        }
        setOrder({ ...order, ...result });
        return;
      }

      const payment = await createVnpayPaymentUrlApi(
        token,
        { orderId: order.id, locale: "vn" },
        key,
      );
      if (useAuthStore.getState().user?.id !== user.id) return;

      const previous = loadVnpayCheckoutSession();
      const sameOrder =
        previous?.orderId === order.id && previous.userId === user.id;
      saveVnpayCheckoutSession({
        userId: user.id,
        orderId: order.id,
        fromOrderDetails: true,
        items: sameOrder ? previous.items : [],
        cartItems: useCartStore.getState().items,
        cartFingerprint: sameOrder ? previous.cartFingerprint : "",
        promotionCode: sameOrder ? previous.promotionCode : "",
        idempotencyKey: key,
        txnRef: payment.txnRef,
        expiresAt: payment.expiresAt,
      });
      redirected = true;
      if (paymentTab && !paymentTab.closed) {
        paymentTab.location.replace(payment.paymentUrl);
        router.push(vnpayStatusPath(order.id, payment.txnRef));
      } else {
        window.location.assign(payment.paymentUrl);
      }
    } catch (error) {
      setRetryError(
        error instanceof Error
          ? error.message
          : "Không thể thử thanh toán lại.",
      );
    } finally {
      if (!redirected) paymentTab?.close();
      retryInFlight.current = false;
      setRetrying(false);
    }
  }

  const fetchOrder = useCallback(async () => {
    if (isInvalidId || !token) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await getOrderByIdApi(token, orderId);
      setOrder(data);
    } catch (err) {
      if (err instanceof OrdersServiceError && err.status === 401) {
        logout();
        setError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      } else if (err instanceof OrdersServiceError && err.status === 404) {
        setError(
          "Không tìm thấy đơn hàng hoặc bạn không có quyền xem đơn hàng này.",
        );
      } else {
        const message =
          err instanceof Error
            ? err.message
            : "Không thể tải thông tin đơn hàng. Vui lòng thử lại.";
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [isInvalidId, orderId, token, logout]);

  useEffect(() => {
    let ignore = false;

    if (isInvalidId || !isAuthenticated || !token) {
      return;
    }

    const loadOrder = async () => {
      try {
        const data = await getOrderByIdApi(token, orderId);
        if (!ignore) {
          setOrder(data);
          setIsLoading(false);
        }
      } catch (err) {
        if (!ignore) {
          if (err instanceof OrdersServiceError && err.status === 401) {
            logout();
            setError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
          } else if (err instanceof OrdersServiceError && err.status === 404) {
            setError(
              "Không tìm thấy đơn hàng hoặc bạn không có quyền xem đơn hàng này.",
            );
          } else {
            const message =
              err instanceof Error
                ? err.message
                : "Không thể tải thông tin đơn hàng. Vui lòng thử lại.";
            setError(message);
          }
          setIsLoading(false);
        }
      }
    };

    void loadOrder();

    return () => {
      ignore = true;
    };
  }, [isInvalidId, isAuthenticated, token, orderId, logout]);

  useEffect(() => {
    if (!token || !order) return;
    const waitingForPayment =
      order.status === "PENDING" || order.status === "PAYMENT_FAILED";
    const waitingForRefund = order.refunds?.some(
      (refund) =>
        refund.status === "PENDING" ||
        refund.status === "PROCESSING" ||
        refund.status === "NEEDS_REVIEW",
    );
    const waitingForLateVnpay = order.payments?.some(
      (payment) =>
        order.status === "CANCELLED" &&
        payment.method === "VNPAY" &&
        payment.status === "PENDING",
    );
    if (!waitingForPayment && !waitingForRefund && !waitingForLateVnpay) return;
    const pollIntervalMs = waitingForPayment ? 5_000 : 15_000;
    const timer = setInterval(() => {
      void getOrderByIdApi(token, order.id)
        .then((updated) => {
          setOrder(updated);
          if (updated.status === "CANCELLED")
            clearCancelledCheckout(updated.id);
        })
        .catch(() => {
          /* Giữ dữ liệu hiện tại khi mạng tạm mất. */
        });
    }, pollIntervalMs);
    return () => clearInterval(timer);
  }, [token, order]);

  if (isAuthLoading) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <p className="font-semibold text-[#9a7c6b]">
          Đang kiểm tra phiên đăng nhập...
        </p>
      </main>
    );
  }

  if (isInvalidId) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <section className="rounded-[22px] border border-rose-200 bg-white px-6 py-12 shadow-xs">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-3xl text-rose-600">
            !
          </div>
          <h1 className="mt-5 text-2xl font-extrabold text-[#40241b]">
            Mã đơn hàng không hợp lệ
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#9a7c6b]">
            Đường dẫn xác nhận đơn thiếu hoặc chứa mã đơn hàng không đúng định
            dạng.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/orders"
              className="inline-flex rounded-full bg-[#f6a14a] px-6 py-3 text-sm font-extrabold text-[#40241b] transition hover:bg-[#f29435]"
            >
              Về lịch sử đơn
            </Link>
            <Link
              href="/"
              className="inline-flex rounded-full border border-[#ead8c7] bg-white px-6 py-3 text-sm font-bold text-[#492214] transition hover:bg-[#fffaf5]"
            >
              Về thực đơn
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (!isAuthenticated || !token || !user) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <section className="rounded-[22px] border border-[#ead8c7] bg-white px-6 py-12 shadow-xs">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-3xl">
            🔒
          </div>
          <h1 className="mt-5 text-2xl font-extrabold text-[#40241b]">
            Vui lòng đăng nhập
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#9a7c6b]">
            Bạn cần đăng nhập để xác nhận và xem chi tiết đơn hàng #{orderId}.
          </p>
          <Link
            href={loginHref(`/order-confirmation?orderId=${orderId}`)}
            className="mt-6 inline-flex rounded-full bg-[#f6a14a] px-7 py-3 text-sm font-extrabold text-[#40241b] transition hover:bg-[#f29435]"
          >
            Đăng nhập ngay
          </Link>
        </section>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <div className="mx-auto max-w-md space-y-4 rounded-[22px] border border-[#ead8c7] bg-white p-8">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-amber-600 border-t-transparent" />
          <p className="font-semibold text-[#40241b]">
            Đang tải dữ liệu đơn hàng #{orderId}...
          </p>
        </div>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <section className="rounded-[22px] border border-rose-200 bg-white px-6 py-12 shadow-xs">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-3xl text-rose-600">
            ✕
          </div>
          <h1 className="mt-5 text-2xl font-extrabold text-[#40241b]">
            Không thể tải đơn hàng
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-rose-700">
            {error || "Đơn hàng không tồn tại hoặc bạn không có quyền xem."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => void fetchOrder()}
              className="inline-flex rounded-full bg-[#f6a14a] px-6 py-3 text-sm font-extrabold text-[#40241b] transition hover:bg-[#f29435]"
            >
              Thử tải lại
            </button>
            <Link
              href="/orders"
              className="inline-flex rounded-full border border-[#ead8c7] bg-white px-6 py-3 text-sm font-bold text-[#492214] transition hover:bg-[#fffaf5]"
            >
              Về lịch sử đơn
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const config = getStatusConfig(order.status);
  const methodLabel =
    order.paymentMethod === "WALLET"
      ? "Ví điện tử"
      : order.paymentMethod === "CARD"
        ? "Thẻ ngân hàng"
        : order.paymentMethod === "VNPAY"
          ? "VNPAY"
          : "Chưa thanh toán";

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/orders"
          className="inline-flex min-w-40 items-center justify-center rounded-full border border-[#ead8c7] bg-white px-6 py-2.5 text-sm font-bold text-[#492214] transition hover:border-[#492214] hover:bg-[#fffaf5]"
        >
          ← Lịch sử đơn
        </Link>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-full bg-[#f6a14a] px-6 py-2.5 text-sm font-bold text-[#40241b] transition hover:bg-[#f29435]"
        >
          Tiếp tục mua hàng
        </Link>
      </div>

      <section
        className="mt-6 rounded-[22px] border border-[#ead8c7] bg-white px-6 py-10 shadow-xs sm:px-10"
        aria-live="polite"
      >
        <div className="text-center">
          <div
            className={`text-5xl font-black ${config.iconColor}`}
            aria-hidden="true"
          >
            {config.icon}
          </div>

          <h1 className="mt-4 text-3xl font-extrabold text-[#40241b] sm:text-4xl">
            {config.title}
          </h1>

          <p className="mx-auto mt-2 max-w-lg text-sm text-[#9a7c6b]">
            {config.subtitle}
          </p>

          <div className="mt-4 inline-flex items-center rounded-full border px-4 py-1.5 text-xs font-extrabold uppercase tracking-wide">
            <span className={config.badgeClass}>{config.badgeLabel}</span>
          </div>
        </div>

        <dl className="mx-auto mt-8 max-w-2xl divide-y divide-amber-900/10 rounded-2xl bg-[#fff8ef] p-6 text-sm">
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-[#9a7c6b]">Mã đơn hàng</dt>
            <dd className="font-extrabold text-[#40241b]">#{order.id}</dd>
          </div>

          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-[#9a7c6b]">Thời gian đặt</dt>
            <dd className="font-semibold text-[#40241b]">
              {formatDate(order.createdAt)}
            </dd>
          </div>

          {order.paidAt && (
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-[#9a7c6b]">Thời gian thanh toán</dt>
              <dd className="font-semibold text-[#40241b]">
                {formatDate(order.paidAt)}
              </dd>
            </div>
          )}

          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-[#9a7c6b]">Phương thức thanh toán</dt>
            <dd className="font-extrabold text-[#40241b]">{methodLabel}</dd>
          </div>

          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-[#9a7c6b]">Khách hàng</dt>
            <dd className="font-semibold text-[#40241b]">
              {user.name} ({user.email})
            </dd>
          </div>
        </dl>

        <div className="mx-auto mt-8 max-w-2xl">
          <h2 className="text-lg font-extrabold text-[#40241b]">
            Danh sách đồ uống đã đặt
          </h2>

          <div className="mt-3 divide-y divide-amber-900/10 rounded-2xl border border-amber-900/10 bg-white">
            {order.items.map((item, idx) => (
              <div
                key={item.id ?? idx}
                className="flex items-center justify-between gap-4 p-4 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-extrabold text-[#40241b]">
                    {item.product?.name || `Món #${item.productId}`}
                    <span className="ml-2 font-semibold text-[#9a7c6b]">
                      (Size {item.size})
                    </span>
                  </p>
                  {item.toppings && item.toppings.length > 0 && (
                    <p className="mt-0.5 text-xs text-[#9a7c6b]">
                      Topping:{" "}
                      {formatToppingLabels(item.toppings.map(formatTopping))}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-[#9a7c6b]">
                    Số lượng: {item.quantity} × {formatPrice(item.unitPrice)}
                  </p>
                </div>

                <div className="text-right whitespace-nowrap">
                  <span className="font-extrabold text-[#7a3b22]">
                    {formatPrice(item.lineTotal)}
                  </span>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between bg-[#fffaf5] p-4 text-base font-extrabold">
              <span className="text-[#40241b]">Tổng thanh toán</span>
              <span className="text-xl text-[#7a3b22]">
                {formatPrice(order.total)}
              </span>
            </div>
          </div>
        </div>

        {order.cancellationReason && (
          <p className="mt-5 text-center text-sm text-stone-600">
            {order.cancellationReason}
          </p>
        )}
        {order.refunds && order.refunds.length > 0 && (
          <section
            className="mx-auto mt-6 max-w-2xl rounded-2xl border border-amber-200 bg-amber-50/70 p-5"
            aria-live="polite"
          >
            <h2 className="font-extrabold text-[#40241b]">
              Trạng thái hoàn tiền
            </h2>
            <ul className="mt-3 space-y-3">
              {order.refunds.map((refund) => (
                <li
                  key={refund.id}
                  className="border-t border-amber-900/10 pt-3 text-sm text-stone-700"
                >
                  <p className="font-semibold">
                    {refundStatusLabels[refund.status]}
                  </p>
                  <p className="mt-1">
                    Số tiền: {formatPrice(refund.amount)}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    Yêu cầu lúc: {formatDate(refund.requestedAt)}
                  </p>
                  {refund.status === "PROCESSING" && (
                    <p className="mt-2 text-xs text-stone-600">
                      VNPay đã tiếp nhận yêu cầu; chưa có xác nhận hoàn tất.
                    </p>
                  )}
                  {refund.status === "NEEDS_REVIEW" && (
                    <p className="mt-2 text-xs text-amber-900">
                      Chưa xác định được kết quả. Hệ thống đang tiếp tục đối
                      soát; chưa ghi nhận hoàn tất.
                    </p>
                  )}
                  {refund.status === "FAILED" && (
                    <p className="mt-2 text-xs text-rose-800">
                      VNPay chưa thực hiện hoàn tiền cho giao dịch này.
                    </p>
                  )}
                  {refund.status === "SUCCEEDED" && refund.completedAt && (
                    <p className="mt-2 text-xs text-emerald-800">
                      Hoàn tất: {formatDate(refund.completedAt)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {(order.status === "PENDING" || order.status === "PAYMENT_FAILED") &&
          order.payments?.[0]?.expiresAt && (
            <p className="mt-4 text-center text-sm text-stone-600">
              Thời hạn thanh toán: {formatDate(order.payments[0].expiresAt)}.
              Đơn sẽ tự hủy nếu quá hạn.
            </p>
          )}
        <div className="mt-10 border-t border-amber-900/10 pt-6">
          {(order.status === "PAYMENT_FAILED" || order.status === "PENDING") && (
            <div className="mx-auto flex max-w-xl flex-col gap-3 rounded-2xl border border-[#ead8c7] bg-[#fffaf5] p-5 sm:flex-row sm:items-center">
              <label className="flex items-center gap-2 text-sm font-bold text-[#7a5a4b] sm:flex-1">
                <span className="whitespace-nowrap">Phương thức</span>
                <select
                  value={retryMethod}
                  disabled={retrying || cancelling}
                  onChange={(event) =>
                    setMethodOverride({
                      orderId: order.id,
                      method: event.target.value as PaymentMethod,
                    })
                  }
                  className="w-full rounded-full border border-[#ead8c7] bg-white px-4 py-3 text-sm font-semibold text-[#40241b] outline-none focus:border-[#f6a14a] disabled:opacity-60"
                >
                  <option value="WALLET">Ví điện tử</option>
                  <option value="CARD">Thẻ ngân hàng</option>
                  <option value="VNPAY">VNPAY Sandbox</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => void retryPayment()}
                disabled={retrying || cancelling}
                className="rounded-full bg-[#f6a14a] px-6 py-3 text-sm font-extrabold text-[#40241b] transition hover:bg-[#f29435] disabled:opacity-60 sm:flex-1"
              >
                {retrying
                  ? "Đang xử lý…"
                  : order.status === "PENDING"
                    ? `Thanh toán đơn #${order.id}`
                    : `Thanh toán lại đơn #${order.id}`}
              </button>
            </div>
          )}
          {retryError && (
            <p
              role="alert"
              className="mt-4 text-center text-sm font-semibold text-red-700"
            >
              {retryError}
            </p>
          )}
          <div className="mx-auto mt-5 grid max-w-xl gap-3 sm:grid-cols-2">
            <Link
              href="/orders"
              className="inline-flex items-center justify-center rounded-full border border-[#ead8c7] bg-white px-6 py-3 text-sm font-extrabold text-[#40241b] transition hover:bg-[#fffaf5]"
            >
              Xem lịch sử đơn hàng
            </Link>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full border border-[#ead8c7] bg-white px-6 py-3 text-sm font-extrabold text-[#40241b] transition hover:bg-[#fffaf5]"
            >
              Chọn thêm món khác
            </Link>
          </div>
          {(order.status === "PENDING" ||
            order.status === "PAYMENT_FAILED" ||
            order.status === "PAID") && (
            <div className="mt-4 text-center">
              <button
                type="button"
                disabled={cancelling || retrying}
                onClick={() => void cancelOrder()}
                className="rounded-full px-5 py-2 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
              >
                {cancelling ? "Đang hủy…" : "Hủy đơn"}
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default function OrderConfirmationPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-4xl px-4 py-16 text-center">
          <p className="font-semibold text-[#9a7c6b]">
            Đang tải màn hình xác nhận...
          </p>
        </main>
      }
    >
      <OrderConfirmationContent />
    </Suspense>
  );
}
