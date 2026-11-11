CREATE TYPE "RefundAttemptType" AS ENUM ('REFUND', 'QUERY');
CREATE TYPE "RefundAttemptStatus" AS ENUM ('STARTED', 'CONFIRMED', 'REJECTED', 'AMBIGUOUS', 'FAILED');

CREATE TABLE "Refund" (
  "id" SERIAL NOT NULL,
  "paymentId" INTEGER NOT NULL,
  "orderId" INTEGER NOT NULL,
  "requestId" TEXT,
  "amount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "checkedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "requestedById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RefundAttempt" (
  "id" SERIAL NOT NULL,
  "refundId" INTEGER NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "type" "RefundAttemptType" NOT NULL,
  "status" "RefundAttemptStatus" NOT NULL DEFAULT 'STARTED',
  "requestId" TEXT NOT NULL,
  "transactionRef" TEXT NOT NULL,
  "transactionNo" TEXT,
  "transactionDate" TIMESTAMP(3) NOT NULL,
  "amount" INTEGER NOT NULL,
  "transactionType" TEXT,
  "responseId" TEXT,
  "responseCode" TEXT,
  "responseMessage" TEXT,
  "responseTransactionNo" TEXT,
  "responsePayDate" TEXT,
  "responseTransactionStatus" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefundAttempt_pkey" PRIMARY KEY ("id")
);

-- Migrate every existing Payment-level refund into the new dedicated entity.
INSERT INTO "Refund" (
  "paymentId", "orderId", "requestId", "amount", "reason", "status",
  "requestedAt", "submittedAt", "completedAt", "checkedAt", "lastError",
  "requestedById", "createdAt", "updatedAt"
)
SELECT
  p."id",
  p."orderId",
  p."refundRequestId",
  COALESCE(p."refundAmount", p."amount"),
  COALESCE(p."refundReason", 'Migrated refund request'),
  COALESCE(p."refundStatus", 'PENDING'::"RefundStatus"),
  COALESCE(p."refundRequestedAt", p."createdAt"),
  p."refundSubmittedAt",
  p."refundCompletedAt",
  p."refundCheckedAt",
  p."refundLastError",
  p."refundRequestedById",
  p."createdAt",
  CURRENT_TIMESTAMP
FROM "Payment" p
WHERE p."refundStatus" IS NOT NULL OR p."refundRequestedAt" IS NOT NULL
ON CONFLICT ("paymentId") DO NOTHING;

-- Preserve the latest known provider interaction as a historical attempt.
-- No signed payload/hash secret is copied into the audit table.
INSERT INTO "RefundAttempt" (
  "refundId", "attemptNumber", "type", "status", "requestId",
  "transactionRef", "transactionNo", "transactionDate", "amount",
  "transactionType", "responseId", "responseCode", "responseMessage",
  "responseTransactionNo", "responsePayDate", "responseTransactionStatus",
  "errorMessage", "startedAt", "completedAt"
)
SELECT
  r."id",
  1,
  'REFUND'::"RefundAttemptType",
  CASE
    WHEN p."refundStatus" = 'SUCCEEDED' THEN 'CONFIRMED'::"RefundAttemptStatus"
    WHEN p."refundStatus" = 'FAILED' THEN 'REJECTED'::"RefundAttemptStatus"
    WHEN p."refundStatus" = 'NEEDS_REVIEW' THEN 'AMBIGUOUS'::"RefundAttemptStatus"
    ELSE 'STARTED'::"RefundAttemptStatus"
  END,
  COALESCE(p."refundRequestId", 'legacy-refund-' || p."id"::TEXT),
  COALESCE(p."providerTxnRef", 'legacy-unknown-' || p."id"::TEXT),
  p."providerTransactionNo",
  p."createdAt",
  COALESCE(p."refundAmount", p."amount"),
  '02',
  p."refundResponseId",
  p."refundResponseCode",
  p."refundResponseMessage",
  p."refundTransactionNo",
  p."refundPayDate",
  p."refundTransactionStatus",
  p."refundLastError",
  COALESCE(p."refundSubmittedAt", p."refundRequestedAt", p."createdAt"),
  COALESCE(p."refundCompletedAt", p."refundCheckedAt")
FROM "Payment" p
JOIN "Refund" r ON r."paymentId" = p."id"
WHERE p."refundRequestId" IS NOT NULL OR p."refundSubmittedAt" IS NOT NULL
ON CONFLICT ("requestId") DO NOTHING;

CREATE UNIQUE INDEX "Refund_paymentId_key" ON "Refund"("paymentId");
CREATE INDEX "Refund_status_checkedAt_idx" ON "Refund"("status", "checkedAt");
CREATE INDEX "Refund_orderId_requestedAt_idx" ON "Refund"("orderId", "requestedAt");
CREATE UNIQUE INDEX "RefundAttempt_requestId_key" ON "RefundAttempt"("requestId");
CREATE UNIQUE INDEX "RefundAttempt_refundId_attemptNumber_key" ON "RefundAttempt"("refundId", "attemptNumber");
CREATE INDEX "RefundAttempt_refundId_createdAt_idx" ON "RefundAttempt"("refundId", "createdAt");

ALTER TABLE "Refund"
  ADD CONSTRAINT "Refund_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Refund_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Refund_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RefundAttempt"
  ADD CONSTRAINT "RefundAttempt_refundId_fkey"
  FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Refund state is now owned by Refund/RefundAttempt, not Payment.
DROP INDEX IF EXISTS "Payment_refundRequestId_key";
DROP INDEX IF EXISTS "Payment_refundStatus_refundCheckedAt_idx";
ALTER TABLE "Payment"
  DROP CONSTRAINT IF EXISTS "Payment_refundRequestedById_fkey",
  DROP COLUMN IF EXISTS "refundStatus",
  DROP COLUMN IF EXISTS "refundRequestId",
  DROP COLUMN IF EXISTS "refundRequestedAt",
  DROP COLUMN IF EXISTS "refundSubmittedAt",
  DROP COLUMN IF EXISTS "refundCompletedAt",
  DROP COLUMN IF EXISTS "refundCheckedAt",
  DROP COLUMN IF EXISTS "refundResponseId",
  DROP COLUMN IF EXISTS "refundResponseCode",
  DROP COLUMN IF EXISTS "refundResponseMessage",
  DROP COLUMN IF EXISTS "refundTransactionNo",
  DROP COLUMN IF EXISTS "refundPayDate",
  DROP COLUMN IF EXISTS "refundTransactionStatus",
  DROP COLUMN IF EXISTS "refundLastError",
  DROP COLUMN IF EXISTS "refundAmount",
  DROP COLUMN IF EXISTS "refundReason",
  DROP COLUMN IF EXISTS "refundRequestedById";

DROP TYPE "RefundStatus" CASCADE;
