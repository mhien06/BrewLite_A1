ALTER TABLE "Refund"
  ADD COLUMN "source" "CancellationSource" NOT NULL DEFAULT 'SYSTEM';

UPDATE "Refund" AS r
SET "source" = o."cancellationSource"
FROM "Order" AS o
WHERE o."id" = r."orderId"
  AND o."cancellationSource" IS NOT NULL;

ALTER TABLE "Refund"
  ALTER COLUMN "source" DROP DEFAULT,
  ADD CONSTRAINT "Refund_amount_positive" CHECK ("amount" > 0);
