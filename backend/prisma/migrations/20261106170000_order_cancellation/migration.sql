CREATE TYPE "CancellationSource" AS ENUM ('CUSTOMER', 'STAFF', 'SYSTEM');

ALTER TABLE "Order"
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancellationSource" "CancellationSource",
  ADD COLUMN "cancelledById" INTEGER,
  ADD COLUMN "cancellationReason" TEXT;

ALTER TABLE "Payment" ADD COLUMN "refundRequestedAt" TIMESTAMP(3);
