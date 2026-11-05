/*
  Warnings:

  - A unique constraint covering the columns `[providerTxnRef]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'VNPAY';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "providerBankCode" TEXT,
ADD COLUMN     "providerPayDate" TEXT,
ADD COLUMN     "providerResponseCode" TEXT,
ADD COLUMN     "providerTransactionNo" TEXT,
ADD COLUMN     "providerTransactionStatus" TEXT,
ADD COLUMN     "providerTxnRef" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "simulateSuccess" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerTxnRef_key" ON "Payment"("providerTxnRef");
