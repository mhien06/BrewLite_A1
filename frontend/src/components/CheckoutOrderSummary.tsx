import type { CartItem } from '@/types/cart';

interface CheckoutOrderSummaryProps {
  items: CartItem[];
  loyaltyPoints: number;
  promotionCode?: string;
  disabled?: boolean;
  onPromotionCodeChange?: (code: string) => void;
}

const formatPrice = (price: number) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(price);

export default function CheckoutOrderSummary({
  items,
  loyaltyPoints,
  promotionCode = '',
  disabled = false,
  onPromotionCodeChange,
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
            value={promotionCode}
            disabled={disabled}
            placeholder="Nhập mã (VD: BREW10, GIAM15K)"
            onChange={(e) => onPromotionCodeChange?.(e.target.value)}
            className="mt-2 w-full rounded-xl border border-[#ead8c7] bg-white px-4 py-3 text-sm text-[#40241b] placeholder:text-[#9a7c6b] focus:border-[#f6a14a] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>
        <p className="mt-2 text-xs text-[#6f9b68]">
          Gợi ý: BREW10 (giảm 10% cho đơn từ 50.000đ, tối đa 20.000đ) hoặc
          GIAM15K (giảm 15.000đ cho đơn từ 60.000đ).
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-[#ead8c7] bg-[#fff8ef] p-5">
        <p className="text-sm font-extrabold text-[#40241b]">
          Điểm thưởng: {loyaltyPoints} điểm
        </p>
        <p className="mt-2 text-xs text-[#9a7c6b]">
          Mỗi 10.000đ thanh toán thành công sẽ tích lũy thêm 1 điểm thưởng.
        </p>
      </div>
    </section>
  );
}
