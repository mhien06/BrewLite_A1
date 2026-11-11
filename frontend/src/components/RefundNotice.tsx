"use client";

import { useState } from "react";
import type { OrderRefund, RefundStatus } from "@/types/staff";

const labels: Record<RefundStatus, string> = {
  PENDING: "Đang chờ gửi yêu cầu hoàn tiền",
  PROCESSING: "VNPay đang xử lý yêu cầu hoàn tiền",
  SUCCEEDED: "VNPay đã xác nhận hoàn tiền",
  FAILED: "VNPay từ chối yêu cầu hoàn tiền",
  NEEDS_REVIEW: "Chưa xác định được kết quả — cần đối soát",
};

const attemptLabels = {
  REFUND: "Gửi yêu cầu Refund",
  QUERY: "Truy vấn đối soát QueryDR",
};

export default function RefundNotice({
  refunds = [],
  staffToken,
}: {
  refunds?: OrderRefund[];
  staffToken?: string;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  if (!refunds.length) return null;

  async function retry(refundId: number) {
    if (!staffToken || busyId !== null) return;
    setBusyId(refundId);
    setMessage("");
    try {
      const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const response = await fetch(
        `${api.replace(/\/$/, "")}/payments/vnpay/refunds/${refundId}/retry`,
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
      {refunds.map((refund) => (
        <div key={refund.id} className="rounded-2xl border border-amber-200 bg-amber-50/70 px-5 py-4 text-sm text-stone-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{labels[refund.status]}</p>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold">{refund.status}</span>
          </div>
          <p className="mt-2">Số tiền: {refund.amount.toLocaleString("vi-VN")} đ</p>
          <p className="mt-1 text-stone-600">Mã Refund: #{refund.id} · Thanh toán: #{refund.payment.id}</p>
          <p className="mt-1 text-stone-600">Yêu cầu lúc: {new Date(refund.requestedAt).toLocaleString("vi-VN")}</p>
          <p className="mt-1 text-stone-600">Lý do: {refund.reason}</p>
          {refund.completedAt && (
            <p className="mt-1 text-green-800">Hoàn tất: {new Date(refund.completedAt).toLocaleString("vi-VN")}</p>
          )}
          {refund.lastError && <p className="mt-2 text-red-800">{refund.lastError}</p>}

          {refund.attempts.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-white/80 p-3">
              <p className="font-semibold">Lịch sử xử lý ({refund.attempts.length} lần gần nhất)</p>
              <ol className="mt-2 space-y-3">
                {refund.attempts.map((attempt) => (
                  <li key={attempt.id} className="border-l-2 border-amber-300 pl-3">
                    <p className="font-medium">
                      Lần {attempt.attemptNumber}: {attemptLabels[attempt.type]} · {attempt.status}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      {new Date(attempt.startedAt).toLocaleString("vi-VN")} · Request ID: {attempt.requestId}
                      {attempt.initiatedBy ? ` · Người thực hiện: ${attempt.initiatedBy.name}` : " · Hệ thống tự động"}
                    </p>
                    {attempt.responseCode && (
                      <p className="mt-1">VNPay: {attempt.responseCode}
                        {attempt.responseTransactionStatus ? ` · trạng thái ${attempt.responseTransactionStatus}` : ""}
                      </p>
                    )}
                    {attempt.responseMessage && <p className="mt-1">{attempt.responseMessage}</p>}
                    {attempt.responseTransactionNo && <p className="mt-1">Mã giao dịch hoàn: {attempt.responseTransactionNo}</p>}
                    {attempt.responsePayDate && <p className="mt-1">Thời điểm: {attempt.responsePayDate}</p>}
                    {attempt.errorMessage && <p className="mt-1 text-red-800">{attempt.errorMessage}</p>}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {staffToken && refund.status === "FAILED" && (
            <button type="button" disabled={busyId !== null} onClick={() => void retry(refund.id)} className="mt-3 rounded-full border border-amber-800 px-4 py-2 font-semibold disabled:opacity-50">
              {busyId === refund.id ? "Đang gửi..." : "Gửi lại yêu cầu bị từ chối"}
            </button>
          )}
        </div>
      ))}
      {message && <p className="text-sm text-stone-700">{message}</p>}
    </div>
  );
}
