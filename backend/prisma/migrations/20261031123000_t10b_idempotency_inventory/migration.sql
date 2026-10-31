ALTER TABLE "Order"
ADD COLUMN "inventoryDeducted" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "simulateSuccess" BOOLEAN NOT NULL DEFAULT true,
    "amount" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Ingredient" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductIngredient" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "ingredientId" INTEGER NOT NULL,
    "amountS" INTEGER NOT NULL,
    "amountM" INTEGER NOT NULL,
    "amountL" INTEGER NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductIngredient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ToppingIngredient" (
    "id" SERIAL NOT NULL,
    "toppingCode" TEXT NOT NULL,
    "ingredientId" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ToppingIngredient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Payment_userId_idempotencyKey_key" ON "Payment"("userId", "idempotencyKey");
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

CREATE UNIQUE INDEX "Ingredient_code_key" ON "Ingredient"("code");

CREATE UNIQUE INDEX "ProductIngredient_productId_ingredientId_key" ON "ProductIngredient"("productId", "ingredientId");
CREATE INDEX "ProductIngredient_productId_idx" ON "ProductIngredient"("productId");
CREATE INDEX "ProductIngredient_ingredientId_idx" ON "ProductIngredient"("ingredientId");

CREATE UNIQUE INDEX "ToppingIngredient_toppingCode_ingredientId_key" ON "ToppingIngredient"("toppingCode", "ingredientId");
CREATE INDEX "ToppingIngredient_toppingCode_idx" ON "ToppingIngredient"("toppingCode");

ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductIngredient"
ADD CONSTRAINT "ProductIngredient_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductIngredient"
ADD CONSTRAINT "ProductIngredient_ingredientId_fkey"
FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ToppingIngredient"
ADD CONSTRAINT "ToppingIngredient_ingredientId_fkey"
FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Ingredient" ("code", "name", "unit", "stock", "version", "updatedAt")
VALUES
    ('COFFEE_BEAN', 'Hạt cà phê', 'g', 1000, 1, CURRENT_TIMESTAMP),
    ('CONDENSED_MILK', 'Sữa đặc', 'ml', 2000, 1, CURRENT_TIMESTAMP),
    ('FRESH_MILK', 'Sữa tươi', 'ml', 3000, 1, CURRENT_TIMESTAMP),
    ('PEACH_TEA_BASE', 'Cốt trà đào', 'ml', 7000, 1, CURRENT_TIMESTAMP),
    ('PEACH_SLICE', 'Đào miếng', 'miếng', 105, 1, CURRENT_TIMESTAMP),
    ('MATCHA_POWDER', 'Bột Matcha', 'g', 300, 1, CURRENT_TIMESTAMP),
    ('PEARLS', 'Trân châu đường đen', 'g', 1500, 1, CURRENT_TIMESTAMP),
    ('CREAM_FOAM', 'Kem sữa macchiato', 'ml', 1600, 1, CURRENT_TIMESTAMP),
    ('COFFEE_JELLY', 'Thạch cà phê', 'g', 1400, 1, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "ProductIngredient" ("productId", "ingredientId", "amountS", "amountM", "amountL", "isRequired")
SELECT p."id", i."id", v."amountS", v."amountM", v."amountL", true
FROM (
    VALUES
        ('Cà phê sữa', 'COFFEE_BEAN', 20, 25, 30),
        ('Cà phê sữa', 'CONDENSED_MILK', 30, 40, 50),
        ('Bạc xỉu', 'COFFEE_BEAN', 15, 20, 25),
        ('Bạc xỉu', 'CONDENSED_MILK', 40, 50, 60),
        ('Bạc xỉu', 'FRESH_MILK', 75, 95, 115),
        ('Trà đào', 'PEACH_TEA_BASE', 150, 200, 250),
        ('Trà đào', 'PEACH_SLICE', 3, 4, 5),
        ('Matcha latte', 'MATCHA_POWDER', 10, 15, 20),
        ('Matcha latte', 'FRESH_MILK', 100, 130, 160),
        ('Matcha latte', 'CONDENSED_MILK', 20, 25, 30)
) AS v("productName", "ingredientCode", "amountS", "amountM", "amountL")
JOIN "Product" p ON p."name" = v."productName"
JOIN "Ingredient" i ON i."code" = v."ingredientCode"
ON CONFLICT ("productId", "ingredientId") DO NOTHING;

INSERT INTO "ToppingIngredient" ("toppingCode", "ingredientId", "amount", "isRequired")
SELECT v."toppingCode", i."id", v."amount", true
FROM (
    VALUES
        ('pearls', 'PEARLS', 30),
        ('cream', 'CREAM_FOAM', 40),
        ('jelly', 'COFFEE_JELLY', 35)
) AS v("toppingCode", "ingredientCode", "amount")
JOIN "Ingredient" i ON i."code" = v."ingredientCode"
ON CONFLICT ("toppingCode", "ingredientId") DO NOTHING;

