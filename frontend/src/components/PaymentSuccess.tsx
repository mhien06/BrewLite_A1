import Link from "next/link";
import type { PaymentResponse } from "@/types/checkout";

interface PaymentSuccessProps {
  payment: PaymentResponse;
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(price);

export default function PaymentSuccess({ payment }: PaymentSuccessProps) {
  const methodLabel =
    payment.paymentMethod === "WALLET" ? "Ví điện tử" : "Thẻ ngân hàng";

  return (
    <section
      className="mt-7 rounded-[22px] border border-[#ead8c7] bg-white px-6 py-10 text-center sm:px-10"
      aria-live="polite"
    >
      <div className="text-5xl font-black text-green-600" aria-hidden="true">
        ✓
      </div>

      <h1 className="mt-4 text-3xl font-extrabold text-[#40241b] sm:text-4xl">
        Thanh toán thành công
      </h1>

      <p className="mt-3 text-sm font-bold text-green-700">{payment.status}</p>

      <dl className="mx-auto mt-6 max-w-md space-y-3 rounded-2xl bg-[#fff8ef] p-5 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-[#9a7c6b]">Mã đơn</dt>
          <dd className="font-extrabold text-[#40241b]">#{payment.id}</dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt className="text-[#9a7c6b]">Phương thức</dt>
          <dd className="font-extrabold text-[#40241b]">{methodLabel}</dd>
        </div>

        <div className="flex justify-between gap-4">
          <dt className="text-[#9a7c6b]">Tổng cộng</dt>
          <dd className="font-extrabold text-[#7a3b22]">
            {formatPrice(payment.total)}
          </dd>
        </div>
      </dl>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href={`/order-confirmation?orderId=${payment.id}`}
          className="inline-flex min-w-44 items-center justify-center rounded-full bg-[#f6a14a] px-6 py-3 text-sm font-extrabold text-[#40241b] transition hover:bg-[#f29435]"
        >
          Chi tiết đơn hàng
        </Link>
        <Link
          href="/orders"
          className="inline-flex min-w-44 items-center justify-center rounded-full border border-[#ead8c7] bg-white px-6 py-3 text-sm font-bold text-[#492214] transition hover:bg-[#fffaf5]"
        >
          Lịch sử đơn hàng
        </Link>
        <Link
          href="/"
          className="inline-flex min-w-40 items-center justify-center rounded-full border border-transparent px-4 py-3 text-sm font-bold text-[#9a7c6b] transition hover:text-[#492214]"
        >
          Về thực đơn
        </Link>
      </div>
    </section>
  );
}
