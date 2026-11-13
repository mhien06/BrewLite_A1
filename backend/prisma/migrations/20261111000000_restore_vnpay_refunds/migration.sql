CREATE TYPE "RefundStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'NEEDS_REVIEW'
);

ALTER TABLE "Payment"
  ADD COLUMN "refundStatus" "RefundStatus",
  ADD COLUMN "refundRequestId" TEXT,
  ADD COLUMN "refundRequestedAt" TIMESTAMP(3),
  ADD COLUMN "refundSubmittedAt" TIMESTAMP(3),
  ADD COLUMN "refundCompletedAt" TIMESTAMP(3),
  ADD COLUMN "refundCheckedAt" TIMESTAMP(3),
  ADD COLUMN "refundResponseId" TEXT,
  ADD COLUMN "refundResponseCode" TEXT,
  ADD COLUMN "refundResponseMessage" TEXT,
  ADD COLUMN "refundTransactionNo" TEXT,
  ADD COLUMN "refundPayDate" TEXT,
  ADD COLUMN "refundTransactionStatus" TEXT,
  ADD COLUMN "refundLastError" TEXT,
  ADD COLUMN "refundAmount" INTEGER,
  ADD COLUMN "refundReason" TEXT,
  ADD COLUMN "refundRequestedById" INTEGER;

CREATE UNIQUE INDEX "Payment_refundRequestId_key"
  ON "Payment"("refundRequestId");

CREATE INDEX "Payment_refundStatus_refundCheckedAt_idx"
  ON "Payment"("refundStatus", "refundCheckedAt");

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_refundRequestedById_fkey"
  FOREIGN KEY ("refundRequestedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve existing paid VNPAY cancellations/late receipts for manual reconciliation.
