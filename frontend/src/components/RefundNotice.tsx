"use client";
import { useState } from "react";

export interface RefundSummary {
  id: number;
  amount: number;
  refundStatus: "QUEUED" | "PENDING" | "FAILED" | "SUCCEEDED" | null;
  expiresAt?: string | null;
  refundCompletedAt?: string | null;
}
const labels = {
  QUEUED: "Đang chuẩn bị yêu cầu hoàn tiền",
  PENDING: "Đang chờ VNPAY xác nhận hoàn tiền",
  FAILED: "Hoàn tiền chưa thành công. Nhân viên cần kiểm tra lại giao dịch.",
  SUCCEEDED: "VNPAY đã xác nhận hoàn tiền",
};

export default function RefundNotice({
  payments = [],
  staffToken,
}: {
  payments?: RefundSummary[];
  staffToken?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function retry(id: number) {
    setBusy(true);
    setMessage("");
    try {
      const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const response = await fetch(
        `${api}/payments/vnpay/refunds/${id}/retry`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${staffToken}` },
        },
      );
      if (!response.ok)
        throw new Error(
          "Chưa thể gửi lại. Vui lòng tải lại dữ liệu và kiểm tra giao dịch.",
        );
      setMessage("Đã gửi yêu cầu. Bấm Làm mới để xem kết quả sau ít phút.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể kết nối.");
    } finally {
      setBusy(false);
    }
  }
  const refunds = payments.filter((payment) => payment.refundStatus !== null);
  if (!refunds.length) return null;
  return (
    <div className="my-4 space-y-3" role="status">
      {refunds.map((payment) => (
        <div
          key={payment.id}
          className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-stone-700"
        >
          <p className="font-semibold">
            {labels[payment.refundStatus ?? "QUEUED"]}
          </p>
          <p className="mt-1">
            Số tiền: {payment.amount.toLocaleString("vi-VN")} đ
          </p>
          {staffToken && payment.refundStatus === "FAILED" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void retry(payment.id)}
              className="mt-3 rounded-full border border-amber-700 px-4 py-2 font-semibold disabled:opacity-50"
            >
              Gửi lại yêu cầu hoàn
            </button>
          )}
        </div>
      ))}
      {message && <p>{message}</p>}
    </div>
  );
}
