import Link from 'next/link';

export default function ProductNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 items-center px-4 py-16 text-center">
      <div className="w-full rounded-3xl border border-amber-900/10 bg-white p-10 shadow-lg">
        <p className="text-5xl" aria-hidden="true">☕</p>
        <h1 className="mt-4 text-2xl font-extrabold text-amber-950">
          Không tìm thấy sản phẩm
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          Sản phẩm này không tồn tại hoặc đã được cập nhật khỏi thực đơn.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-xl bg-amber-800 px-5 py-3 text-sm font-bold text-white hover:bg-amber-900"
        >
          Quay lại thực đơn
        </Link>
      </div>
    </main>
  );
}
