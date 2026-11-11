"use client";

import { useState } from "react";
import type { OrderPayment, RefundStatus } from "@/types/staff";

const labels: Record<RefundStatus, string> = {
  PENDING: "Đang chờ gửi yêu cầu hoàn tiền",
  PROCESSING: "VNPay đang xử lý yêu cầu hoàn tiền",
  SUCCEEDED: "VNPay đã xác nhận hoàn tiền",
  FAILED: "VNPay từ chối yêu cầu hoàn tiền",
  NEEDS_REVIEW: "Chưa xác định được kết quả — cần đối soát",
};

export default function RefundNotice({
  payments = [],
  staffToken,
}: {
  payments?: OrderPayment[];
  staffToken?: string;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const refunds = payments.filter((payment) => payment.refundStatus !== null);
  if (!refunds.length) return null;

  async function retry(paymentId: number) {
    if (!staffToken || busyId !== null) return;
    setBusyId(paymentId);
    setMessage("");
    try {
      const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const response = await fetch(
        `${api.replace(/\/$/, "")}/payments/vnpay/refunds/${paymentId}/retry`,
        { method: "POST", headers: { Authorization: `Bearer ${staffToken}` } },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Không thể gửi lại yêu cầu.");
      setMessage("Đã đưa yêu cầu vào hàng đợi. Tải lại dữ liệu sau ít phút.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể kết nối.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="my-4 space-y-3" role="status" aria-live="polite">
      {refunds.map((payment) => {
        const status = payment.refundStatus as RefundStatus;
        return (
          <div key={payment.id} className="rounded-2xl border border-amber-200 bg-amber-50/70 px-5 py-4 text-sm text-stone-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{labels[status]}</p>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold">{status}</span>
            </div>
            <p className="mt-2">Số tiền: {(payment.refundAmount ?? payment.amount).toLocaleString("vi-VN")} đ</p>
            {payment.refundReason && <p className="mt-1 text-stone-600">Lý do: {payment.refundReason}</p>}
            {payment.refundCompletedAt && <p className="mt-1 text-green-800">Hoàn tất: {new Date(payment.refundCompletedAt).toLocaleString("vi-VN")}</p>}
            {payment.refundLastError && <p className="mt-2 text-red-800">{payment.refundLastError}</p>}
            {staffToken && status === "FAILED" && (
              <button type="button" disabled={busyId !== null} onClick={() => void retry(payment.id)} className="mt-3 rounded-full border border-amber-800 px-4 py-2 font-semibold disabled:opacity-50">
                {busyId === payment.id ? "Đang gửi..." : "Gửi lại yêu cầu bị từ chối"}
              </button>
            )}
          </div>
        );
      })}
      {message && <p className="text-sm text-stone-700">{message}</p>}
    </div>
  );
}