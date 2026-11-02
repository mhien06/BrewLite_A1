-- Bảo vệ dữ liệu ngay cả khi ghi qua công cụ quản trị database.
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_stock_nonnegative" CHECK ("stock" >= 0);
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_version_positive" CHECK ("version" > 0);
ALTER TABLE "ProductIngredient" ADD CONSTRAINT "ProductIngredient_amounts_positive" CHECK ("amountS" > 0 AND "amountM" > 0 AND "amountL" > 0);
ALTER TABLE "ToppingIngredient" ADD CONSTRAINT "ToppingIngredient_amount_positive" CHECK ("amount" > 0);
