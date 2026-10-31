'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getOrderByIdApi, OrdersServiceError } from '@/services/orders.service';
import { useAuthStore } from '@/stores/auth.store';
import type { Order, OrderStatus } from '@/types/order';

const formatPrice = (price: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(price);

const formatDate = (dateStr: string) => {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
};

const TOPPING_LABELS: Record<string, string> = {
  pearls: 'Trân châu',
  cream: 'Kem cheese',
  jelly: 'Thạch',
};

const formatTopping = (toppingId: string) =>
  TOPPING_LABELS[toppingId] || toppingId;

const getStatusConfig = (status: OrderStatus) => {
  switch (status) {
    case 'PAID':
      return {
        icon: '✓',
        iconColor: 'text-emerald-600',
        title: 'Thanh toán thành công',
        subtitle: 'Cảm ơn bạn đã đặt đồ uống tại BrewLite! Đơn hàng đang được barista chuẩn bị.',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        badgeLabel: 'PAID (Đã thanh toán)',
      };
    case 'PENDING':
      return {
        icon: '⏳',
        iconColor: 'text-amber-600',
        title: 'Đơn hàng đang chờ thanh toán',
        subtitle: 'Đơn hàng đã được lưu trên hệ thống và đang chờ hoàn tất thanh toán.',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        badgeLabel: 'PENDING (Chờ thanh toán)',
      };
    case 'PAYMENT_FAILED':
      return {
        icon: '⚠️',
        iconColor: 'text-rose-600',
        title: 'Thanh toán không thành công',
        subtitle: 'Giao dịch thanh toán chưa hoàn tất. Bạn có thể kiểm tra lại số dư hoặc thử lại.',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
        badgeLabel: 'PAYMENT_FAILED (Thất bại)',
      };
    default:
      return {
        icon: '📋',
        iconColor: 'text-stone-600',
        title: 'Chi tiết đơn hàng',
        subtitle: 'Thông tin chi tiết đơn hàng của bạn.',
        badgeClass: 'bg-stone-50 text-stone-700 border-stone-200',
        badgeLabel: status,
      };
  }
};

function OrderConfirmationContent() {
  const searchParams = useSearchParams();
  const rawOrderId = searchParams.get('orderId');
  const orderId = rawOrderId ? Number.parseInt(rawOrderId, 10) : NaN;
  const isInvalidId = !rawOrderId || Number.isNaN(orderId) || orderId <= 0;

  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const logout = useAuthStore((state) => state.logout);

  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(!isInvalidId);
  const [error, setError] = useState<string | null>(null);

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
        setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      } else if (err instanceof OrdersServiceError && err.status === 404) {
        setError('Không tìm thấy đơn hàng hoặc bạn không có quyền xem đơn hàng này.');
      } else {
        const message =
          err instanceof Error
            ? err.message
            : 'Không thể tải thông tin đơn hàng. Vui lòng thử lại.';
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
            setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
          } else if (err instanceof OrdersServiceError && err.status === 404) {
            setError(
              'Không tìm thấy đơn hàng hoặc bạn không có quyền xem đơn hàng này.',
            );
          } else {
            const message =
              err instanceof Error
                ? err.message
                : 'Không thể tải thông tin đơn hàng. Vui lòng thử lại.';
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
            Đường dẫn xác nhận đơn thiếu hoặc chứa mã đơn hàng không đúng định dạng.
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
            href="/login"
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
          <p className="font-semibold text-[#40241b]">Đang tải dữ liệu đơn hàng #{orderId}...</p>
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
            {error || 'Đơn hàng không tồn tại hoặc bạn không có quyền xem.'}
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
    order.paymentMethod === 'WALLET'
      ? 'Ví điện tử'
      : order.paymentMethod === 'CARD'
        ? 'Thẻ ngân hàng'
        : 'Chưa thanh toán';

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
          <div className={`text-5xl font-black ${config.iconColor}`} aria-hidden="true">
            {config.icon}
          </div>

          <h1 className="mt-4 text-3xl font-extrabold text-[#40241b] sm:text-4xl">
            {config.title}
          </h1>

          <p className="mx-auto mt-2 max-w-lg text-sm text-[#9a7c6b]">
            {config.subtitle}
          </p>

          <div className="mt-4 inline-flex items-center rounded-full border px-4 py-1.5 text-xs font-extrabold uppercase tracking-wide">
            <span className={config.badgeClass}>
              {config.badgeLabel}
            </span>
          </div>
        </div>

        <dl className="mx-auto mt-8 max-w-2xl divide-y divide-amber-900/10 rounded-2xl bg-[#fff8ef] p-6 text-sm">
          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-[#9a7c6b]">Mã đơn hàng</dt>
            <dd className="font-extrabold text-[#40241b]">#{order.id}</dd>
          </div>

          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-[#9a7c6b]">Thời gian đặt</dt>
            <dd className="font-semibold text-[#40241b]">{formatDate(order.createdAt)}</dd>
          </div>

          {order.paidAt && (
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-[#9a7c6b]">Thời gian thanh toán</dt>
              <dd className="font-semibold text-[#40241b]">{formatDate(order.paidAt)}</dd>
            </div>
          )}

          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-[#9a7c6b]">Phương thức thanh toán</dt>
            <dd className="font-extrabold text-[#40241b]">{methodLabel}</dd>
          </div>

          <div className="flex justify-between gap-4 py-2.5">
            <dt className="text-[#9a7c6b]">Khách hàng</dt>
            <dd className="font-semibold text-[#40241b]">{user.name} ({user.email})</dd>
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
                      Topping: {item.toppings.map(formatTopping).join(', ')}
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
              <span className="text-xl text-[#7a3b22]">{formatPrice(order.total)}</span>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-4 border-t border-amber-900/10 pt-6">
          <Link
            href="/orders"
            className="inline-flex min-w-44 items-center justify-center rounded-full bg-[#f6a14a] px-6 py-3 text-sm font-extrabold text-[#40241b] transition hover:bg-[#f29435]"
          >
            Xem lịch sử đơn
          </Link>
          <Link
            href="/"
            className="inline-flex min-w-44 items-center justify-center rounded-full border border-[#ead8c7] bg-white px-6 py-3 text-sm font-bold text-[#492214] transition hover:bg-[#fffaf5]"
          >
            Chọn thêm món khác
          </Link>
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
          <p className="font-semibold text-[#9a7c6b]">Đang tải màn hình xác nhận...</p>
        </main>
      }
    >
      <OrderConfirmationContent />
    </Suspense>
  );
}
