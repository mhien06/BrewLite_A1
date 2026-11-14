-- Additive only: existing pending payments become eligible without changing
-- payment/order/refund business state. The claim survives worker restarts.
ALTER TABLE "Payment"
  ADD COLUMN "reconciliationAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reconciliationNextAt" TIMESTAMP(3),
  ADD COLUMN "reconciliationToken" TEXT,
  ADD COLUMN "reconciliationResult" TEXT;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reconciliationAttempts_check"
  CHECK ("reconciliationAttempts" >= 0);

CREATE INDEX "Payment_method_status_reconciliationNextAt_idx"
  ON "Payment"("method", "status", "reconciliationNextAt");
