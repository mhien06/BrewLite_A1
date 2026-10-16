import React from 'react';

export default function Loading() {
  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      {/* Banner Skeleton */}
      <div className="mb-8 w-full rounded-2xl bg-amber-100/50 p-5 sm:rounded-3xl sm:p-8 animate-pulse">
        <div className="mb-3 h-4 w-32 rounded-full bg-amber-200/80" />
        <div className="mb-2 h-7 w-3/4 max-w-sm rounded-xl bg-amber-300/60 sm:h-8" />
        <div className="h-4 w-full max-w-md rounded-md bg-amber-200/60" />
      </div>

      {/* Grid Skeleton */}
      <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-amber-900/10 bg-white shadow-xs animate-pulse"
          >
            <div className="aspect-4/3 w-full bg-amber-100/60" />
            <div className="space-y-3 p-5">
              <div className="h-5 w-3/4 rounded-md bg-amber-200/70" />
              <div className="h-3 w-1/3 rounded-md bg-stone-200" />
              <div className="flex items-center justify-between border-t border-amber-950/5 pt-3">
                <div className="h-6 w-24 rounded-md bg-amber-300/60" />
                <div className="h-4 w-16 rounded-md bg-stone-200" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
