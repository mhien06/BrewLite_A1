import React from 'react';
import { getProducts } from '@/services/products.service';
import ProductGrid from '@/components/ProductGrid';

export default async function MenuPage() {
  const products = await getProducts();

  return (
    <main className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* Hero / Menu Intro Banner */}
      <section className="relative mb-8 w-full overflow-hidden rounded-2xl border border-amber-900/10 bg-gradient-to-br from-amber-900 via-amber-950 to-stone-900 p-5 text-amber-50 shadow-xl shadow-amber-950/20 sm:mb-10 sm:rounded-3xl sm:p-8 md:p-10">
        <div className="relative z-10 w-full max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-semibold tracking-wider text-amber-300 uppercase backdrop-blur-xs ring-1 ring-amber-400/30">
            <span>☕</span>
            Thực đơn đồ uống
          </div>

          <h1 className="mt-3 text-2xl font-bold leading-tight tracking-tight text-amber-50 sm:mt-4 sm:text-4xl lg:text-5xl">
            Thưởng thức hương vị{' '}
            <span className="text-amber-400">cà phê nguyên chất</span>
          </h1>

          <p className="mt-3 break-words text-xs leading-relaxed text-amber-200/85 sm:text-base">
            Từng ly cà phê và thức uống tại BrewLite được chọn lọc từ những hạt cà phê tinh hoa,
            pha chế tỉ mỉ và phục vụ trọn vẹn sự tươi mới.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs font-medium text-amber-200/90 sm:mt-6 sm:gap-4">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-950/40 px-2.5 py-1 sm:bg-transparent sm:p-0">
              <svg className="h-3.5 w-3.5 shrink-0 text-amber-400 sm:h-4 sm:w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              100% Cà phê nguyên chất
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-950/40 px-2.5 py-1 sm:bg-transparent sm:p-0">
              <svg className="h-3.5 w-3.5 shrink-0 text-amber-400 sm:h-4 sm:w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Thanh toán không tiền mặt
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-950/40 px-2.5 py-1 sm:bg-transparent sm:p-0">
              <svg className="h-3.5 w-3.5 shrink-0 text-amber-400 sm:h-4 sm:w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Pha chế tại chỗ
            </span>
          </div>
        </div>

        {/* Decorative background glow & pattern */}
        <div className="pointer-events-none absolute -right-12 -bottom-12 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 opacity-10 hidden lg:block">
          <svg className="h-44 w-44 text-amber-200" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M2 21h18v-2H2M20 8h-2V5h2m0-2H4v10a4 4 0 004 4h6a4 4 0 004-4v-3h2a2 2 0 002-2V5a2 2 0 00-2-2z" />
          </svg>
        </div>
      </section>

      {/* Menu Header Title & Count */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-amber-950 sm:text-2xl">
            Danh sách đồ uống
          </h2>
          <p className="mt-0.5 text-xs text-stone-500">
            Chọn món yêu thích của bạn ngay hôm nay
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-amber-900/10 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
          {products.length} sản phẩm
        </span>
      </div>

      {/* Product Grid */}
      <ProductGrid products={products} />
    </main>
  );
}
