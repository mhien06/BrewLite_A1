-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'KHACH HANG',
    "passwordHash" TEXT NOT NULL,
    "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- Insert default seed user if any existing orders exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "Order") THEN
        INSERT INTO "User" ("id", "email", "name", "passwordHash", "loyaltyPoints")
        VALUES (1, 'default@gmail.com', 'KHACH HANG', '$2b$10$eEcfqJ0gZcE0q1V8bC1O1e9eJv4k1S8/41E9iV7F9MvW0e3V3jB0y', 0)
        ON CONFLICT ("id") DO NOTHING;
    END IF;
END $$;

-- AlterTable Order
ALTER TABLE "Order" ADD COLUMN "userId" INTEGER;

UPDATE "Order" SET "userId" = 1 WHERE "userId" IS NULL;

ALTER TABLE "Order" ALTER COLUMN "userId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

SELECT setval(
    pg_get_serial_sequence('"User"', 'id'),
    COALESCE(MAX("id"), 1),
    MAX("id") IS NOT NULL
)
FROM "User";
