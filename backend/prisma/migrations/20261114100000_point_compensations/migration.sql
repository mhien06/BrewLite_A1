CREATE TYPE "PointCompensationType" AS ENUM ('RESTORE', 'REFUND_CREDIT');

CREATE TABLE "PointCompensation" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "paymentId" INTEGER,
    "type" "PointCompensationType" NOT NULL,
    "points" INTEGER NOT NULL,
    "amount" INTEGER,
    "note" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointCompensation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PointCompensation_points_check" CHECK ("points" > 0),
    CONSTRAINT "PointCompensation_amount_check" CHECK ("amount" IS NULL OR "amount" > 0)
);

CREATE UNIQUE INDEX "PointCompensation_paymentId_key" ON "PointCompensation"("paymentId");
CREATE UNIQUE INDEX "PointCompensation_idempotencyKey_key" ON "PointCompensation"("idempotencyKey");
CREATE INDEX "PointCompensation_userId_createdAt_idx" ON "PointCompensation"("userId", "createdAt");
CREATE INDEX "PointCompensation_orderId_createdAt_idx" ON "PointCompensation"("orderId", "createdAt");
CREATE INDEX "PointCompensation_type_createdAt_idx" ON "PointCompensation"("type", "createdAt");

ALTER TABLE "PointCompensation"
  ADD CONSTRAINT "PointCompensation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PointCompensation"
  ADD CONSTRAINT "PointCompensation_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PointCompensation"
  ADD CONSTRAINT "PointCompensation_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_cancelledById_fkey"
  FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The existing flag is authoritative for old cancellations: restore only the
-- missing ledger history, never alter the already restored user balance.
INSERT INTO "PointCompensation"
  ("userId", "orderId", "type", "points", "note", "idempotencyKey", "createdAt")
SELECT "userId", "id", 'RESTORE', "loyaltyPointsUsed",
       'Khôi phục điểm đã dùng khi hủy đơn #' || "id",
       'RESTORE:' || "id", COALESCE("cancelledAt", "createdAt")
FROM "Order"
WHERE "loyaltyPointsRestored" = TRUE
  AND "loyaltyPointsUsed" > 0
ON CONFLICT ("idempotencyKey") DO NOTHING;
