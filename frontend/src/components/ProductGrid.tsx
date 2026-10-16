import React from 'react';
import { Product } from '@/types/product';
import ProductCard from './ProductCard';

interface ProductGridProps {
  products: Product[];
}

export default function ProductGrid({ products }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="flex w-full flex-col items-center justify-center rounded-3xl border border-dashed border-amber-900/20 bg-amber-50/50 px-6 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 shadow-inner">
          <svg
            className="h-8 w-8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
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
        <h3 className="mt-4 text-xl font-bold text-amber-950">
          Chưa có sản phẩm nào
        </h3>
        <p className="mt-2 max-w-md text-sm text-stone-600">
          Hiện tại thực đơn của BrewLite đang được chuẩn bị. Vui lòng quay lại
          sau ít phút để khám phá các thức uống mới nhất nhé!
        </p>
      </div>
    );
  }

  return (
    <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
