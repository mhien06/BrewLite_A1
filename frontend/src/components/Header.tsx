'use client';

import Link from 'next/link';
import {
  selectTotalQuantity,
  useCartStore,
} from '@/stores/cart.store';

export default function Header() {
  const totalQuantity = useCartStore(selectTotalQuantity);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-amber-900/10 bg-amber-50/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2.5 sm:gap-3"
          aria-label="Về trang thực đơn BrewLite"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-700 via-amber-800 to-amber-950 text-amber-100 shadow-md shadow-amber-950/15 ring-1 ring-amber-600/30 sm:h-11 sm:w-11">
            <svg
              className="h-5 w-5 sm:h-6 sm:w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
              <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
              <line x1="6" y1="2" x2="6" y2="4" />
              <line x1="10" y1="2" x2="10" y2="4" />
              <line x1="14" y1="2" x2="14" y2="4" />
            </svg>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-xl font-bold tracking-tight text-amber-950 sm:text-2xl">
                Brew<span className="text-amber-600">Lite</span>
              </span>
              <span className="hidden rounded-full bg-amber-200/70 px-2 py-0.5 text-xs font-semibold text-amber-800 sm:inline-block">
                Menu
              </span>
            </div>
            <p className="hidden text-xs text-stone-600 sm:block">
              Cà phê nguyên chất & đồ uống pha chế
            </p>
          </div>
        </Link>

        <Link
          href="/cart"
          className="relative inline-flex items-center gap-2 rounded-full border border-amber-900/10 bg-amber-100 px-4 py-2 text-sm font-bold text-amber-950 transition hover:bg-amber-200"
          aria-label={`Giỏ hàng có ${totalQuantity} sản phẩm`}
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="9" cy="20" r="1" />
            <circle cx="19" cy="20" r="1" />
            <path d="M3 4h2l2.4 10.5a2 2 0 0 0 2 1.5h7.8a2 2 0 0 0 2-1.6L21 7H6" />
          </svg>

          <span className="hidden sm:inline">Giỏ hàng</span>

          <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-amber-800 px-1.5 py-0.5 text-xs font-extrabold text-white">
            {totalQuantity}
          </span>
        </Link>
      </div>
    </header>
  );
}