import type { PaymentMethod } from '@/types/checkout';

interface PaymentMethodPanelProps {
  method: PaymentMethod;
  subtotal?: number;
  discountAmount?: number;
  total: number;
  isSubmitting: boolean;
  error: string;
  onMethodChange: (method: PaymentMethod) => void;
  onSubmit: (simulateSuccess: boolean) => void;
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(price);

export default function PaymentMethodPanel({
  method,
  subtotal,
  discountAmount = 0,
  total,
  isSubmitting,
  error,
  onMethodChange,
  onSubmit,
}: PaymentMethodPanelProps) {
  return (
    <aside className="rounded-[22px] border border-[#ead8c7] bg-white p-5 sm:p-6">
      <h2 className="text-2xl font-extrabold text-[#40241b]">
        Phương thức thanh toán
      </h2>

      <div className="mt-4 space-y-3">
        {[
          { value: 'WALLET', label: 'Ví điện tử' },
          { value: 'CARD', label: 'Thẻ ngân hàng' },
        ].map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-5 py-4 text-sm font-bold text-[#492214] ${
              method === option.value
                ? 'border-[#ead8c7] bg-[#fff8ef]'
                : 'border-[#ead8c7] bg-white'
            }`}
          >
            <input
              type="radio"
              name="paymentMethod"
              value={option.value}
              checked={method === option.value}
              disabled={isSubmitting}
              onChange={() =>
                onMethodChange(option.value as PaymentMethod)
              }
              className="accent-[#4a2115]"
            />
            {option.label}
          </label>
        ))}
      </div>

      <dl className="mt-5 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-[#9a7c6b]">Tạm tính</dt>
          <dd className="font-extrabold text-[#40241b]">
            {formatPrice(subtotal ?? total)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-[#9a7c6b]">Khuyến mãi</dt>
          <dd className="font-extrabold text-[#6f9b68]">
            {discountAmount > 0
              ? `-${formatPrice(discountAmount)}`
              : formatPrice(0)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-[#9a7c6b]">Điểm</dt>
          <dd className="font-extrabold text-[#40241b]">
            {formatPrice(0)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="font-extrabold text-[#40241b]">
            Tổng cộng
          </dt>
          <dd className="font-extrabold text-[#7a3b22]">
            {formatPrice(total)}
          </dd>
        </div>
      </dl>

      {error && (
        <p
          className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
          role="alert"
        >
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={isSubmitting}
        onClick={() => onSubmit(true)}
        className="mt-5 w-full rounded-full bg-[#f6a14a] px-5 py-3.5 text-sm font-extrabold text-[#40241b] transition hover:bg-[#f29435] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Đang xử lý...' : 'Xác nhận thanh toán'}
      </button>

      <button
        type="button"
        disabled={isSubmitting}
        onClick={() => onSubmit(false)}
        className="mt-3 w-full rounded-full border border-[#ead8c7] bg-white px-5 py-3.5 text-sm font-extrabold text-[#492214] transition hover:border-[#492214] hover:bg-[#fffaf5] disabled:cursor-not-allowed disabled:opacity-60"
      >
        Mô phỏng thanh toán lỗi
      </button>
    </aside>
  );
}
