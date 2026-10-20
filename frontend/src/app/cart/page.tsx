'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  selectTotalPrice,
  selectTotalQuantity,
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
  const totalQuantity = useCartStore(selectTotalQuantity);
  const totalPrice = useCartStore(selectTotalPrice);

  if (items.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center px-4 py-16 sm:px-6">
        <section className="w-full rounded-3xl border border-amber-900/10 bg-white px-6 py-14 text-center shadow-xl shadow-amber-950/5">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-3xl">
            🛒
          </div>
          <h1 className="mt-5 text-3xl font-extrabold text-amber-950">
            Giỏ hàng đang trống
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-stone-600">
            Hãy chọn thức uống, kích cỡ và topping yêu thích từ thực đơn
            BrewLite.
          </p>
          <Link
            href="/"
            className="mt-7 inline-flex rounded-xl bg-amber-800 px-5 py-3 text-sm font-bold text-white transition hover:bg-amber-900"
          >
            Xem thực đơn
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-widest text-amber-700 uppercase">
            BrewLite Cart
          </p>
          <h1 className="mt-1 text-3xl font-extrabold text-amber-950 sm:text-4xl">
            Giỏ hàng của bạn
          </h1>
        </div>

        <Link
          href="/"
          className="text-sm font-bold text-amber-800 hover:text-amber-950"
        >
          ← Tiếp tục chọn món
        </Link>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="space-y-4" aria-label="Sản phẩm trong giỏ hàng">
          {items.map((item) => {
            const productQuantity = items
              .filter(
                (cartItem) => cartItem.productId === item.productId,
              )
              .reduce(
                (total, cartItem) => total + cartItem.quantity,
                0,
              );

            return (
              <article
                key={item.key}
                className="grid gap-4 rounded-2xl border border-amber-900/10 bg-white p-4 shadow-sm sm:grid-cols-[7rem_1fr_auto]"
              >
                <div className="relative aspect-square overflow-hidden rounded-xl bg-amber-100">
                  <Image
                    src={item.imageUrl}
                    alt={item.name}
                    fill
                    sizes="112px"
                    className="object-cover"
                  />
                </div>

                <div className="min-w-0">
                  <h2 className="text-lg font-extrabold text-amber-950">
                    {item.name}
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-stone-600">
                    Size {item.size.id} · {item.size.label}
                  </p>
                  <p className="mt-1 text-sm text-stone-500">
                    {item.toppings.length > 0
                      ? item.toppings
                          .map((topping) => topping.label)
                          .join(', ')
                      : 'Không topping'}
                  </p>
                  <p className="mt-3 font-bold text-amber-800">
                    {formatPrice(item.unitPrice)}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                  <div
                    className="inline-flex items-center rounded-xl border border-amber-900/10"
                    aria-label={`Số lượng ${item.name}`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        updateQuantity(item.key, item.quantity - 1)
                      }
                      className="px-3 py-2 font-bold text-amber-900 hover:bg-amber-100"
                      aria-label={`Giảm số lượng ${item.name}`}
                    >
                      −
                    </button>
                    <span className="min-w-9 text-center text-sm font-extrabold">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateQuantity(item.key, item.quantity + 1)
                      }
                      disabled={productQuantity >= item.stock}
                      className="px-3 py-2 font-bold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:text-stone-300"
                      aria-label={`Tăng số lượng ${item.name}`}
                    >
                      +
                    </button>
                  </div>

                  <div className="text-right">
                    <p className="font-extrabold text-amber-950">
                      {formatPrice(item.unitPrice * item.quantity)}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeItem(item.key)}
                      className="mt-2 text-xs font-bold text-red-700 hover:text-red-900"
                    >
                      Xóa
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <aside className="h-fit rounded-2xl bg-amber-950 p-6 text-amber-50 lg:sticky lg:top-24">
          <h2 className="text-xl font-extrabold">Tóm tắt đơn hàng</h2>

          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-amber-200">Tổng số lượng</dt>
              <dd className="font-bold">{totalQuantity}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-amber-100/20 pt-4">
              <dt className="font-bold">Tổng tiền</dt>
              <dd className="text-xl font-extrabold">
                {formatPrice(totalPrice)}
              </dd>
            </div>
          </dl>

          <p className="mt-5 rounded-xl bg-amber-100/10 px-4 py-3 text-xs leading-5 text-amber-200">
            Thông tin giỏ hàng đã sẵn sàng để sử dụng cho bước đặt hàng
            trong T06.
          </p>
        </aside>
      </div>
    </main>
  );
}