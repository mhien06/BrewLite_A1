CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'STAFF');
ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER';
CREATE TABLE "InventoryMovement" (
 "id" SERIAL PRIMARY KEY, "ingredientId" INTEGER NOT NULL, "actorId" INTEGER NOT NULL,
 "delta" INTEGER NOT NULL, "before" INTEGER NOT NULL, "after" INTEGER NOT NULL,
 "reason" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "InventoryMovement_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "InventoryMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "InventoryMovement_ingredientId_createdAt_idx" ON "InventoryMovement"("ingredientId", "createdAt");
