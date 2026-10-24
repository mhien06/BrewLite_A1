'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth.store';
import {
  selectTotalPrice,
  useCartStore,
} from '@/stores/cart.store';

const formatPrice = (price: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(price);

export default function CartPage() {
  const items = useCartStore((state) => state.items);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const totalPrice = useCartStore(selectTotalPrice);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="inline-flex min-w-40 items-center justify-center rounded-full border border-[#ead8c7] bg-white px-6 py-3 text-sm font-bold text-[#492214] transition hover:border-[#492214] hover:bg-[#fffaf5]"
      >
        ← Thực đơn
      </Link>

      <header className="mt-8">
        <p className="text-xs font-bold tracking-wide text-[#f39a3f] uppercase">
          Giỏ hàng
        </p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-[#40241b] sm:text-5xl">
          Giỏ hàng của bạn
        </h1>
        <p className="mt-2 text-base text-[#9a7c6b]">
          Kiểm tra lại món trước khi tiếp tục.
        </p>
      </header>

      {items.length === 0 ? (
        <section className="mt-8 rounded-[22px] border border-[#ead8c7] bg-white px-6 py-14 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#fff1e3] text-3xl">
            🛒
          </div>
          <h2 className="mt-5 text-2xl font-extrabold text-[#40241b]">
            Giỏ hàng đang trống
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#9a7c6b]">
            Hãy chọn thức uống, kích cỡ và topping yêu thích từ Menu
            BrewLite.
          </p>
          <Link
            href="/"
            className="mt-7 inline-flex min-w-48 items-center justify-center rounded-full bg-[#f6a14a] px-6 py-3 text-sm font-bold text-[#40241b] transition hover:bg-[#f29435]"
          >
            Tiếp tục chọn món
          </Link>
        </section>
      ) : (
        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <section
            className="space-y-4"
            aria-label="Sản phẩm trong giỏ hàng"
          >
            {items.map((item) => {
              const productQuantity = items
                .filter(
                  (cartItem) =>
                    cartItem.productId === item.productId,
                )
                .reduce(
                  (total, cartItem) => total + cartItem.quantity,
                  0,
                );

              const toppingNames =
                item.toppings.length > 0
                  ? item.toppings
                      .map((topping) => topping.label)
                      .join(', ')
                  : 'Không topping';

              return (
                <article
                  key={item.key}
                  className="flex flex-col gap-5 rounded-[22px] border border-[#ead8c7] bg-white p-5 sm:flex-row sm:items-center"
                >
                  <div className="relative h-28 w-full shrink-0 overflow-hidden rounded-xl bg-[#f7eadf] sm:w-32">
                    <Image
                      src={item.imageUrl}
                      alt={item.name}
                      fill
                      sizes="128px"
                      className="object-cover"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-extrabold text-[#40241b]">
                      {item.name}
                    </h2>
                    <p className="mt-1 text-sm text-[#9a7c6b]">
                      Size {item.size.id} • {toppingNames}
                    </p>
                    <p className="mt-2 text-base font-extrabold text-[#7a3b22]">
                      {formatPrice(item.unitPrice)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-5 sm:flex-col sm:items-end">
                    <div
                      className="inline-flex items-center gap-1 text-[#40241b]"
                      aria-label={`Số lượng ${item.name}`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          updateQuantity(
                            item.key,
                            item.quantity - 1,
                          )
                        }
                        className="flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold transition hover:bg-[#fff1e3]"
                        aria-label={`Giảm số lượng ${item.name}`}
                      >
                        −
                      </button>

                      <span className="min-w-6 text-center text-sm font-extrabold">
                        {item.quantity}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          updateQuantity(
                            item.key,
                            item.quantity + 1,
                          )
                        }
                        disabled={productQuantity >= item.stock}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold transition hover:bg-[#fff1e3] disabled:cursor-not-allowed disabled:text-stone-300"
                        aria-label={`Tăng số lượng ${item.name}`}
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeItem(item.key)}
                      className="min-w-28 rounded-full border border-[#ead8c7] bg-white px-5 py-2.5 text-sm font-bold text-[#492214] transition hover:border-[#492214] hover:bg-[#fffaf5]"
                    >
                      Xóa
                    </button>
                  </div>
                </article>
              );
            })}
          </section>

          <aside className="rounded-[22px] border border-[#ead8c7] bg-white p-6 lg:sticky lg:top-24">
            <h2 className="text-2xl font-extrabold text-[#40241b]">
              Tóm tắt đơn hàng
            </h2>

            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-[#9a7c6b]">Tạm tính</dt>
                <dd className="font-bold text-[#40241b]">
                  {formatPrice(totalPrice)}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-4">
                <dt className="text-[#9a7c6b]">Giảm giá</dt>
                <dd className="font-bold text-[#40241b]">
                  {formatPrice(0)}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-[#ead8c7] pt-4">
                <dt className="font-extrabold text-[#40241b]">
                  Tổng cộng
                </dt>
                <dd className="text-lg font-extrabold text-[#7a3b22]">
                  {formatPrice(totalPrice)}
                </dd>
              </div>
            </dl>

            {isAuthenticated && user ? (
              <div className="mt-4 rounded-xl bg-amber-50 p-3.5 text-xs text-amber-950">
                <p className="font-bold">Đã đăng nhập: {user.email}</p>
                <p className="mt-0.5 text-amber-700">
                  Điểm tích lũy: {user.loyaltyPoints} điểm
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50/70 p-3.5 text-xs text-amber-900">
                <p className="font-bold">Chưa đăng nhập</p>
                <p className="mt-0.5 text-stone-600">
                  Đăng nhập để liên kết đơn hàng và tích lũy điểm thưởng.
                </p>
                <Link
                  href="/login"
                  className="mt-2 inline-flex items-center rounded-full bg-[#f6a14a] px-3.5 py-1 font-bold text-[#40241b] transition hover:bg-[#f29435]"
                >
                  Đăng nhập ngay
                </Link>
              </div>
            )}

            <button
              type="button"
              disabled
              title="Chức năng thanh toán được triển khai ở task tiếp theo"
              className="mt-5 w-full rounded-full bg-[#f6a14a] px-5 py-3.5 text-sm font-extrabold text-[#40241b] disabled:cursor-not-allowed"
            >
              Thanh toán
            </button>

            <Link
              href="/"
              className="mt-3 flex w-full items-center justify-center rounded-full border border-[#ead8c7] bg-white px-5 py-3.5 text-sm font-extrabold text-[#492214] transition hover:border-[#492214] hover:bg-[#fffaf5]"
            >
              Tiếp tục chọn món
            </Link>
          </aside>
        </div>
      )}
    </main>
  );
}