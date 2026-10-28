import type { CartItem } from '@/types/cart';

interface CheckoutOrderSummaryProps {
  items: CartItem[];
  loyaltyPoints: number;
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(price);

export default function CheckoutOrderSummary({
  items,
  loyaltyPoints,
}: CheckoutOrderSummaryProps) {
  return (
    <section className="rounded-[22px] border border-[#ead8c7] bg-white p-5 sm:p-6">
      <h2 className="text-2xl font-extrabold text-[#40241b]">
        Đơn hàng
      </h2>

      <div className="mt-4 space-y-3">
        {items.map((item) => {
          const toppings = item.toppings
            .map((topping) => topping.label)
            .join(', ');

          return (
            <div
              key={item.key}
              className="flex items-start justify-between gap-5 text-sm"
            >
              <div className="text-[#9a7c6b]">
                <p>
                  {item.name} {item.size.id}
                  {toppings ? ` + ${toppings}` : ''}
                </p>
                {item.quantity > 1 && (
                  <p className="mt-0.5 text-xs">
                    Số lượng: {item.quantity}
                  </p>
                )}
              </div>

              <p className="shrink-0 font-extrabold text-[#40241b]">
                {formatPrice(item.unitPrice * item.quantity)}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-2xl border border-[#ead8c7] bg-[#fff8ef] p-5">
        <p className="text-sm font-extrabold text-[#40241b]">
          Mã khuyến mãi
        </p>
        <label className="mt-3 block text-xs font-bold text-[#492214]">
          Mã
          <input
            type="text"
            value="Chưa áp dụng"
            disabled
            className="mt-2 w-full rounded-xl border border-[#ead8c7] bg-white px-4 py-3 text-sm text-[#9a7c6b]"
          />
        </label>
        <p className="mt-2 text-xs text-[#6f9b68]">
          Khuyến mãi được triển khai ở task tiếp theo.
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-[#ead8c7] bg-[#fff8ef] p-5">
        <p className="text-sm font-extrabold text-[#40241b]">
          Điểm thưởng: {loyaltyPoints} điểm
        </p>
        <p className="mt-2 text-xs text-[#9a7c6b]">
          Chưa sử dụng điểm thưởng trong phiên bản Checkout này.
        </p>
      </div>
    </section>
  );
}