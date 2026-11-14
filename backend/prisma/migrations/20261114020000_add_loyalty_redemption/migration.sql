ALTER TABLE "Order"
ADD COLUMN "loyaltyPointsUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "loyaltyDiscountAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "loyaltyPointsRestored" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Order"
ADD CONSTRAINT "Order_loyaltyPointsUsed_nonnegative" CHECK ("loyaltyPointsUsed" >= 0),
ADD CONSTRAINT "Order_loyaltyDiscountAmount_nonnegative" CHECK ("loyaltyDiscountAmount" >= 0);
