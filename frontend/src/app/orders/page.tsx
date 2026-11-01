'use client';

import { formatToppingLabels } from "@/utils/toppings";
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getMyOrdersApi, OrdersServiceError } from '@/services/orders.service';
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

const getStatusBadge = (status: OrderStatus) => {
  switch (status) {
    case 'PAID':
      return {
        label: 'Đã thanh toán',
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    case 'PENDING':
      return {
        label: 'Chờ thanh toán',
        className: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'PAYMENT_FAILED':
      return {
        label: 'Thanh toán thất bại',
        className: 'bg-rose-50 text-rose-700 border-rose-200',
      };
    default:
      return {
        label: status,
        className: 'bg-stone-50 text-stone-700 border-stone-200',
      };
  }
};

const TOPPING_LABELS: Record<string, string> = {
  pearls: 'Trân châu',
  cream: 'Kem sữa',
  jelly: 'Thạch cà phê',
};

const formatTopping = (toppingId: string) =>
  TOPPING_LABELS[toppingId] || toppingId;

export default function OrderHistoryPage() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const logout = useAuthStore((state) => state.logout);

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await getMyOrdersApi(token);
      setOrders(data);
    } catch (err) {
      if (err instanceof OrdersServiceError && err.status === 401) {
        logout();
        setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      } else {
        const message =
          err instanceof Error
            ? err.message
            : 'Không thể tải danh sách đơn hàng. Vui lòng thử lại.';
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [token, logout]);

  useEffect(() => {
    let ignore = false;

    if (!isAuthenticated || !token) {
      return;
    }

    const fetchData = async () => {
      try {
        const data = await getMyOrdersApi(token);
        if (!ignore) {
          setOrders(data);
          setIsLoading(false);
        }
      } catch (err) {
        if (!ignore) {
          if (err instanceof OrdersServiceError && err.status === 401) {
            logout();
            setError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
          } else {
            const message =
              err instanceof Error
                ? err.message
                : 'Không thể tải danh sách đơn hàng. Vui lòng thử lại.';
            setError(message);
          }
          setIsLoading(false);
        }
      }
    };

    void fetchData();

    return () => {
      ignore = true;
    };
  }, [isAuthenticated, token, logout]);

  if (isAuthLoading) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <p className="font-semibold text-[#9a7c6b]">
          Đang kiểm tra phiên đăng nhập...
        </p>
      </main>
    );
  }

  if (!isAuthenticated || !token || !user) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <section className="rounded-[22px] border border-[#ead8c7] bg-white px-6 py-12 shadow-xs">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-3xl">
            🔒
          </div>
          <h1 className="mt-5 text-2xl font-extrabold text-[#40241b] sm:text-3xl">
            Vui lòng đăng nhập
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#9a7c6b]">
            Bạn cần đăng nhập tài khoản để xem lịch sử và quản lý các đơn hàng đã đặt.
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

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="inline-flex min-w-40 items-center justify-center rounded-full border border-[#ead8c7] bg-white px-6 py-2.5 text-sm font-bold text-[#492214] transition hover:border-[#492214] hover:bg-[#fffaf5]"
      >
        ← Thực đơn
      </Link>

      <header className="mt-6">
        <p className="text-xs font-bold tracking-wide text-[#f39a3f] uppercase">
          Tài khoản: {user.name}
        </p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#40241b] sm:text-4xl">
          Lịch sử đơn hàng
        </h1>
        <p className="mt-1 text-sm text-[#9a7c6b]">
          Danh sách các đơn đồ uống bạn đã đặt tại BrewLite.
        </p>
      </header>

      {isLoading ? (
        <div className="mt-8 space-y-4" aria-label="Đang tải danh sách đơn">
          {[1, 2, 3].map((skeletonIndex) => (
            <div
              key={skeletonIndex}
              className="animate-pulse rounded-[22px] border border-[#ead8c7] bg-white p-6 shadow-xs"
            >
              <div className="flex items-center justify-between gap-4 border-b border-amber-900/10 pb-4">
                <div className="h-6 w-32 rounded bg-amber-100" />
                <div className="h-6 w-24 rounded-full bg-amber-100" />
              </div>
              <div className="mt-4 space-y-3">
                <div className="h-4 w-3/4 rounded bg-amber-50" />
                <div className="h-4 w-1/2 rounded bg-amber-50" />
              </div>
              <div className="mt-4 flex justify-between border-t border-amber-900/10 pt-4">
                <div className="h-5 w-24 rounded bg-amber-100" />
                <div className="h-5 w-28 rounded bg-amber-100" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <section className="mt-8 rounded-[22px] border border-rose-200 bg-rose-50/50 p-6 text-center">
          <p className="font-bold text-rose-800">{error}</p>
          <button
            type="button"
            onClick={() => void loadOrders()}
            className="mt-4 inline-flex items-center justify-center rounded-full bg-[#f6a14a] px-6 py-2.5 text-sm font-bold text-[#40241b] transition hover:bg-[#f29435]"
          >
            Thử tải lại
          </button>
        </section>
      ) : orders.length === 0 ? (
        <section className="mt-8 rounded-[22px] border border-[#ead8c7] bg-white px-6 py-16 text-center shadow-xs">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#fff1e3] text-3xl">
            ☕
          </div>
          <h2 className="mt-5 text-2xl font-extrabold text-[#40241b]">
            Chưa có đơn hàng nào
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[#9a7c6b]">
            Bạn chưa đặt món nào tại BrewLite. Hãy khám phá thực đơn cà phê thơm ngon và trà thanh mát ngay hôm nay!
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex min-w-48 items-center justify-center rounded-full bg-[#f6a14a] px-7 py-3 text-sm font-bold text-[#40241b] transition hover:bg-[#f29435]"
          >
            Khám phá thực đơn
          </Link>
        </section>
      ) : (
        <section className="mt-8 space-y-5" aria-label="Danh sách đơn hàng đã đặt">
          {orders.map((order) => {
            const badge = getStatusBadge(order.status);
            const methodLabel =
              order.paymentMethod === 'WALLET'
                ? 'Ví điện tử'
                : order.paymentMethod === 'CARD'
                  ? 'Thẻ ngân hàng'
                  : 'Chưa thanh toán';

            return (
              <article
                key={order.id}
                className="rounded-[22px] border border-[#ead8c7] bg-white p-5 shadow-xs transition hover:border-[#dfc4ad] sm:p-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-900/10 pb-4">
                  <div className="min-w-0">
                    <span className="font-extrabold text-[#40241b] sm:text-lg">
                      Đơn hàng #{order.id}
                    </span>
                    <span className="ml-3 text-xs text-[#9a7c6b]">
                      {formatDate(order.createdAt)}
                    </span>
                  </div>

                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </div>

                <div className="mt-4 divide-y divide-amber-900/5">
                  {order.items.map((item, idx) => (
                    <div
                      key={item.id ?? idx}
                      className="flex items-center justify-between gap-4 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-[#40241b]">
                          {item.product?.name || `Món #${item.productId}`}
                          <span className="ml-2 font-normal text-[#9a7c6b]">
                            (Size {item.size})
                          </span>
                        </p>
                        {item.toppings && item.toppings.length > 0 && (
                          <p className="text-xs text-[#9a7c6b]">
                            Topping: {formatToppingLabels(item.toppings.map(formatTopping))}
                          </p>
                        )}
                      </div>

                      <div className="text-right whitespace-nowrap">
                        <span className="text-xs text-[#9a7c6b]">
                          {item.quantity} × {formatPrice(item.unitPrice)}
                        </span>
                        <p className="font-bold text-[#7a3b22]">
                          {formatPrice(item.lineTotal)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-amber-900/10 pt-4">
                  <div className="text-xs text-[#9a7c6b]">
                    Phương thức: <span className="font-semibold text-[#40241b]">{methodLabel}</span>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <span className="text-xs text-[#9a7c6b]">Tổng tiền: </span>
                      <span className="text-base font-black text-[#7a3b22] sm:text-lg">
                        {formatPrice(order.total)}
                      </span>
                    </div>

                    <Link
                      href={`/order-confirmation?orderId=${order.id}`}
                      className="inline-flex items-center justify-center rounded-full border border-amber-900/15 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-950 transition hover:bg-amber-100"
                    >
                      Chi tiết →
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
