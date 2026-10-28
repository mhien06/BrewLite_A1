"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CheckoutOrderSummary from "@/components/CheckoutOrderSummary";
import PaymentFailure from "@/components/PaymentFailure";
import PaymentMethodPanel from "@/components/PaymentMethodPanel";
import { createOrderApi, createPaymentApi } from "@/services/checkout.service";
import { useAuthStore } from "@/stores/auth.store";
import {
  createCartFingerprint,
  useCheckoutStore,
} from "@/stores/checkout.store";
import { selectTotalPrice, useCartStore } from "@/stores/cart.store";
import type { PaymentMethod } from "@/types/checkout";

export default function CheckoutPage() {
  const router = useRouter();

  const items = useCartStore((state) => state.items);
  const totalPrice = useCartStore(selectTotalPrice);
  const clearCart = useCartStore((state) => state.clearCart);

  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);

  const pendingOrder = useCheckoutStore((state) => state.pendingOrder);
  const setPendingOrder = useCheckoutStore((state) => state.setPendingOrder);
  const clearPendingOrder = useCheckoutStore(
    (state) => state.clearPendingOrder,
  );

  const [method, setMethod] = useState<PaymentMethod>("WALLET");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentFailed, setPaymentFailed] = useState(false);
  const [error, setError] = useState("");
  const [serverTotal, setServerTotal] = useState<number | null>(null);

  const cartFingerprint = useMemo(() => createCartFingerprint(items), [items]);

  const displayTotal =
    pendingOrder !== null &&
    pendingOrder.userId === user?.id &&
    pendingOrder.cartFingerprint === cartFingerprint &&
    serverTotal !== null
      ? serverTotal
      : totalPrice;

  const handlePayment = async (simulateSuccess: boolean) => {
    if (isSubmitting) return;

    if (!token || !user) {
      setError("Vui lòng đăng nhập trước khi thanh toán.");
      return;
    }

    if (items.length === 0) {
      setError("Giỏ hàng đang trống.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      let orderId: number;

      if (
        pendingOrder &&
        pendingOrder.userId === user.id &&
        pendingOrder.cartFingerprint === cartFingerprint
      ) {
        orderId = pendingOrder.orderId;
      } else {
        const order = await createOrderApi(token, {
          items: items.map((item) => ({
            productId: item.productId,
            size: item.size.id,
            quantity: item.quantity,
            toppings: item.toppings.map((topping) => topping.id),
          })),
        });

        orderId = order.id;
        setServerTotal(order.total);
        setPendingOrder(user.id, order.id, cartFingerprint);
      }

      const payment = await createPaymentApi(token, {
        orderId,
        method,
        simulateSuccess,
      });

      setServerTotal(payment.total);

      if (payment.status === "PAID") {
        clearCart();
        clearPendingOrder();
        router.push("/");
        return;
      }

      setPaymentFailed(true);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Không thể xử lý thanh toán.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isAuthLoading) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <p className="font-semibold text-[#9a7c6b]">
          Đang kiểm tra phiên đăng nhập...
        </p>
      </main>
    );
  }

  if (!isAuthenticated || !token || !user) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <section className="rounded-[22px] border border-[#ead8c7] bg-white px-6 py-12">
          <h1 className="text-3xl font-extrabold text-[#40241b]">
            Vui lòng đăng nhập
          </h1>
          <p className="mt-3 text-[#9a7c6b]">
            Bạn cần đăng nhập trước khi thanh toán.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-flex rounded-full bg-[#f6a14a] px-7 py-3 text-sm font-extrabold text-[#40241b]"
          >
            Đăng nhập
          </Link>
        </section>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <section className="rounded-[22px] border border-[#ead8c7] bg-white px-6 py-12">
          <h1 className="text-3xl font-extrabold text-[#40241b]">
            Giỏ hàng đang trống
          </h1>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-full bg-[#f6a14a] px-7 py-3 text-sm font-extrabold text-[#40241b]"
          >
            Chọn món
          </Link>
        </section>
      </main>
    );
  }

  if (paymentFailed) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => setPaymentFailed(false)}
          className="inline-flex min-w-40 items-center justify-center rounded-full border border-[#ead8c7] bg-white px-6 py-3 text-sm font-bold text-[#492214]"
        >
          ← Thanh toán
        </button>

        <PaymentFailure onRetry={() => setPaymentFailed(false)} />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/cart"
        className="inline-flex min-w-40 items-center justify-center rounded-full border border-[#ead8c7] bg-white px-6 py-3 text-sm font-bold text-[#492214] transition hover:border-[#492214]"
      >
        ← Giỏ hàng
      </Link>

      <header className="mt-8">
        <p className="text-xs font-bold tracking-wide text-[#f39a3f] uppercase">
          Checkout
        </p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-[#40241b] sm:text-5xl">
          Thanh toán
        </h1>
        <p className="mt-2 text-base text-[#9a7c6b]">
          Chọn phương thức thanh toán không tiền mặt.
        </p>
      </header>

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(340px,0.95fr)]">
        <CheckoutOrderSummary
          items={items}
          loyaltyPoints={user.loyaltyPoints}
        />

        <PaymentMethodPanel
          method={method}
          total={displayTotal}
          isSubmitting={isSubmitting}
          error={error}
          onMethodChange={(nextMethod) => {
            setMethod(nextMethod);
            setError("");
          }}
          onSubmit={handlePayment}
        />
      </div>
    </main>
  );
}
