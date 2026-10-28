import Link from 'next/link';

interface PaymentFailureProps {
  onRetry: () => void;
}

export default function PaymentFailure({
  onRetry,
}: PaymentFailureProps) {
  return (
    <section className="mt-7 rounded-[22px] border border-[#ead8c7] bg-white px-6 py-10 text-center sm:px-10">
      <div
        className="text-5xl font-black text-[#c65343]"
        aria-hidden="true"
      >
        ×
      </div>

      <h1 className="mt-4 text-3xl font-extrabold text-[#40241b] sm:text-4xl">
        Thanh toán chưa thành công
      </h1>

      <p className="mt-3 text-sm font-bold text-[#c65343]">
        PAYMENT_FAILED
      </p>

      <p className="mt-3 text-sm leading-6 text-[#9a7c6b] sm:text-base">
        Giỏ hàng vẫn được giữ nguyên. Bạn có thể quay lại Checkout và
        chọn phương thức thanh toán khác.
      </p>

      <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onRetry}
          className="min-w-48 rounded-full bg-[#f6a14a] px-6 py-3 text-sm font-extrabold text-[#40241b] transition hover:bg-[#f29435]"
        >
          Quay lại thanh toán
        </button>

        <Link
          href="/cart"
          className="min-w-40 rounded-full border border-[#ead8c7] bg-white px-6 py-3 text-sm font-extrabold text-[#492214] transition hover:border-[#492214] hover:bg-[#fffaf5]"
        >
          Về giỏ hàng
        </Link>
      </div>
    </section>
  );
}