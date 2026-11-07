CREATE TYPE "RefundStatus" AS ENUM ('QUEUED', 'PENDING', 'FAILED', 'SUCCEEDED');
ALTER TABLE "Payment"
  ADD COLUMN "refundStatus" "RefundStatus",
  ADD COLUMN "refundRequestId" TEXT,
  ADD COLUMN "refundSubmittedAt" TIMESTAMP(3),
  ADD COLUMN "refundCompletedAt" TIMESTAMP(3),
  ADD COLUMN "refundCheckedAt" TIMESTAMP(3),
  ADD COLUMN "refundResponseCode" TEXT,
  ADD COLUMN "refundTransactionStatus" TEXT,
  ADD COLUMN "refundLastError" TEXT;
CREATE UNIQUE INDEX "Payment_refundRequestId_key" ON "Payment"("refundRequestId");
CREATE INDEX "Payment_refundStatus_refundCheckedAt_idx" ON "Payment"("refundStatus", "refundCheckedAt");
UPDATE "Payment" SET "refundStatus" = 'QUEUED' WHERE "refundRequestedAt" IS NOT NULL;
