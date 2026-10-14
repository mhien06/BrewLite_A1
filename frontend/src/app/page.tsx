export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-amber-50 px-6">
      <section className="w-full max-w-xl rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-widest text-amber-700">BrewLite</p>
        <h1 className="mt-4 text-3xl font-bold text-stone-900">Xin chào từ BrewLite!</h1>
        <p className="mt-4 leading-7 text-stone-600">Ứng dụng đặt và thanh toán đồ uống không dùng tiền mặt.</p>
        <p className="mt-6 text-sm text-stone-500">T01 · Nền tảng Next.js đã sẵn sàng.</p>
      </section>
    </main>
  );
}
