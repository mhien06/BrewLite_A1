import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { InventoryService } from './inventory.service.js';
import { CheckCartDto } from './dto/check-cart.dto.js';

const TOPPINGS = [
  { code: 'pearls', label: 'Trân châu' },
  { code: 'cream', label: 'Kem sữa' },
  { code: 'jelly', label: 'Thạch cà phê' },
];
type Needs = Map<number, number>;

// Chỉ đọc khả năng đáp ứng. API này không giữ chỗ và không trừ kho.
@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  private addNeeds(target: Needs, source: Needs, quantity = 1) {
    for (const [id, amount] of source)
      target.set(id, (target.get(id) ?? 0) + amount * quantity);
  }

  private maxQuantity(needs: Needs, remaining: Map<number, number>): number {
    if (needs.size === 0) return 0;
    let maximum = Number.MAX_SAFE_INTEGER;
    for (const [id, amount] of needs) {
      if (!Number.isInteger(amount) || amount <= 0) return 0;
      maximum = Math.min(
        maximum,
        Math.floor(Math.max(0, remaining.get(id) ?? 0) / amount),
      );
    }
    return maximum;
  }

  async checkCart(dto: CheckCartDto) {
    return this.prisma.$transaction(
      async (tx) => {
        // Đọc theo cùng một snapshot, tránh ghép tồn trước và sau một thanh toán khác.
        const products = await tx.product.findMany({
          where: {
            id: { in: [...new Set(dto.items.map((item) => item.productId))] },
          },
          include: {
            recipes: {
              where: { isRequired: true },
              include: { ingredient: true },
            },
          },
        });
        const toppingRecipes = await tx.toppingIngredient.findMany({
          where: { isRequired: true },
          include: { ingredient: true },
        });
        const stocks = new Map<number, number>();
        for (const product of products)
          for (const recipe of product.recipes)
            stocks.set(recipe.ingredientId, recipe.ingredient.stock);
        for (const recipe of toppingRecipes)
          stocks.set(recipe.ingredientId, recipe.ingredient.stock);

        const toppingNeeds = new Map<string, Needs>();
        for (const topping of TOPPINGS) {
          const needs: Needs = new Map();
          for (const recipe of toppingRecipes.filter(
            (recipe) => recipe.toppingCode === topping.code,
          )) {
            needs.set(
              recipe.ingredientId,
              (needs.get(recipe.ingredientId) ?? 0) + recipe.amount,
            );
          }
          toppingNeeds.set(topping.code, needs);
        }

        const lines = dto.items.map((item) => {
          const product = products.find(
            (product) => product.id === item.productId,
          );
          if (!product)
            throw new NotFoundException(
              'Món trong giỏ không còn tồn tại. Vui lòng xóa món và chọn lại.',
            );
          const baseNeeds: Needs = new Map();
          for (const recipe of product.recipes) {
            const amount = this.inventory.getAmountBySize(recipe, item.size);
            baseNeeds.set(
              recipe.ingredientId,
              (baseNeeds.get(recipe.ingredientId) ?? 0) + amount,
            );
          }
          const needs = new Map(baseNeeds);
          for (const code of item.toppings)
            this.addNeeds(needs, toppingNeeds.get(code) ?? new Map());
          const configured =
            baseNeeds.size > 0 &&
            item.toppings.every(
              (code) => (toppingNeeds.get(code)?.size ?? 0) > 0,
            );
          return { item, name: product.name, baseNeeds, needs, configured };
        });

        const totalNeeds: Needs = new Map();
        for (const line of lines)
          this.addNeeds(totalNeeds, line.needs, line.item.quantity);

        const items = lines.map((line, index) => {
          // Trừ nhu cầu của các dòng KHÁC, rồi tính dòng này còn mua được bao nhiêu.
          const remaining = new Map(stocks);
          for (const [id, amount] of totalNeeds) {
            const ownAmount = (line.needs.get(id) ?? 0) * line.item.quantity;
            remaining.set(id, (stocks.get(id) ?? 0) - (amount - ownAmount));
          }
          const mainMaxQuantity = this.maxQuantity(line.baseNeeds, remaining);
          const maximum = line.configured
            ? this.maxQuantity(line.needs, remaining)
            : 0;
          const toppings = TOPPINGS.map((topping) => {
            const needs = new Map(line.baseNeeds);
            for (const code of new Set([...line.item.toppings, topping.code]))
              this.addNeeds(needs, toppingNeeds.get(code) ?? new Map());
            const ownNeeds = toppingNeeds.get(topping.code) ?? new Map();
            const configured = ownNeeds.size > 0 && line.configured;
            return {
              ...topping,
              stockQuantity: this.maxQuantity(ownNeeds, remaining),
              maxQuantity: configured ? this.maxQuantity(needs, remaining) : 0,
            };
          });
          let message: string | null = null;
          if (!line.configured)
            message = `${line.name} hoặc topping đã chọn hiện chưa phục vụ. Vui lòng đổi lựa chọn.`;
          else if (mainMaxQuantity < line.item.quantity)
            message = `${line.name} size ${line.item.size} không đủ số lượng đã chọn. Vui lòng giảm số lượng hoặc chọn món khác.`;
          else if (maximum < line.item.quantity) {
            const selectedTopping = toppings.find(
              (topping) =>
                line.item.toppings.includes(topping.code) &&
                topping.maxQuantity < line.item.quantity,
            );
            message = `Topping ${selectedTopping?.label ?? 'đã chọn'} không đủ cho ${line.item.quantity} ly ${line.name}. Vui lòng giảm số lượng, bỏ hoặc đổi topping.`;
          }
          return {
            index,
            productId: line.item.productId,
            size: line.item.size,
            quantity: line.item.quantity,
            maxQuantity: maximum,
            mainMaxQuantity,
            message,
            toppings,
          };
        });
        return {
          available: items.every((item) => item.message === null),
          items,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
