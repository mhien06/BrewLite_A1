ALTER TABLE "Order" ADD COLUMN "inventorySnapshot" JSONB;
ALTER TABLE "LoyaltyTransaction" ADD COLUMN "reversed" BOOLEAN NOT NULL DEFAULT false;
