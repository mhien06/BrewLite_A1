"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Product } from "@/types/product";

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const [imageError, setImageError] = useState(false);
  const isAvailable = product.stock > 0;

  const formattedPrice = new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(product.price);

  return (
    <article
      data-testid={`product-card-${product.id}`}
      className={`group relative flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-amber-900/10 bg-white shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-amber-950/10 ${
        !isAvailable ? "opacity-75 grayscale-25" : ""
      }`}
    >
      {/* Product Image Container */}
      <div className="relative aspect-4/3 w-full overflow-hidden bg-amber-100/50">
        {!imageError && product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            onError={() => setImageError(true)}
            unoptimized={product.imageUrl.includes("placehold.co")}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-amber-50 to-amber-200/60 p-4 text-amber-800/70">
            <svg
              className="h-12 w-12"
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
            <span className="mt-2 text-xs font-medium text-amber-900/60">
              Hình ảnh minh họa
            </span>
          </div>
        )}

        {/* Stock Badge on Top of Image */}
        <div className="absolute top-3 right-3 max-w-[calc(100%-1.5rem)]">
          {isAvailable ? (
            <span className="inline-flex items-center gap-1 truncate rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-emerald-800 shadow-xs backdrop-blur-xs ring-1 ring-emerald-600/20">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600"></span>
              <span

                className="truncate"
              >
                Còn hàng ({product.stock})
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 truncate rounded-full bg-stone-900/80 px-2.5 py-1 text-xs font-semibold text-stone-200 shadow-xs backdrop-blur-xs">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-stone-400"></span>
              <span className="truncate">Tạm hết hàng</span>
            </span>
          )}
        </div>
      </div>

      {/* Product Information */}
      <div className="flex flex-1 flex-col justify-between p-5">
        <div>
          <h3 className="line-clamp-1 text-base font-bold text-amber-950 transition-colors group-hover:text-amber-800 sm:text-lg">
            <Link
              href={`/products/${product.id}`}
              className="after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-700"
              aria-label={`Xem chi tiết ${product.name}`}
            >
              {product.name}
            </Link>
          </h3>
          <p className="mt-1 text-xs text-stone-500">
            Mã món: #{String(product.id).padStart(3, "0")}
          </p>
        </div>

        <div className="mt-4 flex items-baseline justify-between border-t border-amber-950/5 pt-3">
          <div>
            <span className="text-xs text-stone-600">Giá bán</span>
            <p className="text-lg font-extrabold tracking-tight text-amber-900">
              {formattedPrice}
            </p>
          </div>

          <span
            className={`text-xs font-semibold ${
              isAvailable ? "text-amber-700" : "text-stone-600"
            }`}
          >
            {isAvailable ? "Sẵn sàng phục vụ" : "Hẹn lần sau"}
          </span>
        </div>
      </div>
    </article>
  );
}
