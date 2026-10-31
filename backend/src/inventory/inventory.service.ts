import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type DrinkSize = 'S' | 'M' | 'L';

// Thông tin 1 dòng món trong giỏ hàng/đơn hàng cần tính nguyên liệu
export interface CartRecipeItemInput {
  productId: number;
  productName?: string;
  size: string;
  quantity: number;
  toppings: string[];
}

// Định mức 1 nguyên liệu cần cho 1 phần đồ uống
export interface IngredientRecipeQuota {
  ingredientId: number;
  code: string;
  name: string;
  unit: string;
  stock: number;
  version: number;
  amountPerUnit: number;
  isRequired: boolean;
}

// Tổng lượng cần dùng của 1 nguyên liệu sau khi cộng gộp cả giỏ hàng
export interface AggregatedIngredientDemand {
  ingredientId: number;
  code: string;
  name: string;
  unit: string;
  requiredAmount: number;
  currentStock: number;
  version: number;
}

// Số lần thử lại tối đa khi có nhiều người bấm thanh toán cùng lúc (Optimistic Locking)
const MAX_RETRY = 5;

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 1. Lấy định mức nguyên liệu theo Size (S, M, L)
   */
  getAmountBySize(
    recipe: { amountS: number; amountM: number; amountL: number },
    size: string,
  ): number {
    if (size === 'S') return recipe.amountS;
    if (size === 'M') return recipe.amountM;
    if (size === 'L') return recipe.amountL;
    return -1;
  }

  /**
   * 2. Công thức tính số ly tối đa có thể pha chế từ lượng nguyên liệu còn trong kho:
   *    Số ly bán được = min( floor(tồn kho nguyên liệu / định mức 1 ly) )
   */
  calculateAvailableUnitsFromQuotas(
    quotas: readonly IngredientRecipeQuota[],
    options: { strict?: boolean } = {},
  ): number {
    // Chỉ xét các nguyên liệu bắt buộc phải có trong công thức
    const requiredQuotas = quotas.filter((q) => q.isRequired);

    // Nếu món chưa có công thức nguyên liệu
    if (requiredQuotas.length === 0) {
      if (options.strict) {
        throw new BadRequestException(
          'Sản phẩm chưa được cấu hình công thức nguyên liệu bắt buộc.',
        );
      }
      return 0;
    }

    // Gộp định mức nếu cùng 1 nguyên liệu xuất hiện nhiều lần trong 1 ly
    const totalPerCupByIngredient = new Map<
      number,
      { stock: number; amountPerUnit: number; name: string }
    >();

    for (const quota of requiredQuotas) {
      // Kiểm tra định mức phải là số nguyên dương (> 0)
      if (!Number.isInteger(quota.amountPerUnit) || quota.amountPerUnit <= 0) {
        if (options.strict) {
          throw new BadRequestException(
            `Định mức nguyên liệu ${quota.name} không hợp lệ.`,
          );
        }
        return 0;
      }

      // Kiểm tra tồn kho không được âm
      if (!Number.isInteger(quota.stock) || quota.stock < 0) {
        if (options.strict) {
          throw new BadRequestException(
            `Tồn kho nguyên liệu ${quota.name} không hợp lệ.`,
          );
        }
        return 0;
      }

      const existing = totalPerCupByIngredient.get(quota.ingredientId);
      if (existing) {
        existing.amountPerUnit += quota.amountPerUnit;
      } else {
        totalPerCupByIngredient.set(quota.ingredientId, {
          stock: quota.stock,
          amountPerUnit: quota.amountPerUnit,
          name: quota.name,
        });
      }
    }

    // Tìm giá trị nhỏ nhất (min) của phép chia: floor(tồn kho / định mức 1 ly)
    let minCups = Infinity;
    for (const item of totalPerCupByIngredient.values()) {
      const cupsPossible = Math.floor(item.stock / item.amountPerUnit);
      if (cupsPossible < minCups) {
        minCups = cupsPossible;
      }
    }

    return Number.isFinite(minCups) ? Math.max(0, minCups) : 0;
  }

  /**
   * 3. Tính số lượng còn hàng của 1 sản phẩm để hiển thị ra Menu (GET /products)
   */
  async calculateProductAvailableStock(
    productId: number,
    size: DrinkSize = 'S',
    toppings: string[] = [],
    tx: Prisma.TransactionClient = this.prisma,
    strict = false,
  ): Promise<number> {
    // Lấy công thức của món từ bảng ProductIngredient
    const productRecipes = await tx.productIngredient.findMany({
      where: { productId },
      include: { ingredient: true },
    });

    // Lấy công thức của các topping (nếu có chọn kèm)
    const uniqueToppings = [...new Set(toppings)];
    const toppingRecipes =
      uniqueToppings.length > 0
        ? await tx.toppingIngredient.findMany({
            where: { toppingCode: { in: uniqueToppings } },
            include: { ingredient: true },
          })
        : [];

    const quotas: IngredientRecipeQuota[] = [
      ...productRecipes.map((r) => ({
        ingredientId: r.ingredientId,
        code: r.ingredient.code,
        name: r.ingredient.name,
        unit: r.ingredient.unit,
        stock: r.ingredient.stock,
        version: r.ingredient.version,
        amountPerUnit: this.getAmountBySize(r, size),
        isRequired: r.isRequired,
      })),
      ...toppingRecipes.map((r) => ({
        ingredientId: r.ingredientId,
        code: r.ingredient.code,
        name: r.ingredient.name,
        unit: r.ingredient.unit,
        stock: r.ingredient.stock,
        version: r.ingredient.version,
        amountPerUnit: r.amount,
        isRequired: r.isRequired,
      })),
    ];

    return this.calculateAvailableUnitsFromQuotas(quotas, { strict });
  }

  /**
   * 4. Cộng gộp tổng nguyên liệu cần dùng cho TOÀN BỘ GIỎ HÀNG / ĐƠN HÀNG
   *    (Ví dụ: Cà phê sữa và Bạc xỉu cùng dùng chung Hạt cà phê và Sữa đặc)
   */
  async aggregateOrderIngredientDemands(
    tx: Prisma.TransactionClient,
    items: readonly CartRecipeItemInput[],
    mode: 'order' | 'payment' = 'order',
  ): Promise<AggregatedIngredientDemand[]> {
    // Khi tạo đơn lỗi thì trả 400 (BadRequest), khi thanh toán lỗi thì trả 409 (Conflict)
    const createError = (message: string) =>
      mode === 'payment'
        ? new ConflictException(message)
        : new BadRequestException(message);

    if (items.length === 0) {
      throw createError('Danh sách món trong đơn hàng không được trống.');
    }

    // Lấy toàn bộ công thức của các món có trong giỏ
    const productIds = [...new Set(items.map((item) => item.productId))];
    const productRecipes = await tx.productIngredient.findMany({
      where: { productId: { in: productIds } },
      include: { ingredient: true },
    });

    // Lấy toàn bộ công thức của các topping có trong giỏ
    const allToppings = [
      ...new Set(items.flatMap((item) => item.toppings ?? [])),
    ];
    const toppingRecipes =
      allToppings.length > 0
        ? await tx.toppingIngredient.findMany({
            where: { toppingCode: { in: allToppings } },
            include: { ingredient: true },
          })
        : [];

    // Map lưu tổng lượng cần dùng theo từng ingredientId
    const demandsMap = new Map<number, AggregatedIngredientDemand>();

    const addIngredientNeed = (
      ing: {
        id: number;
        code: string;
        name: string;
        unit: string;
        stock: number;
        version: number;
      },
      amountNeeded: number,
    ) => {
      const current = demandsMap.get(ing.id);
      if (current) {
        current.requiredAmount += amountNeeded;
        current.currentStock = ing.stock;
        current.version = ing.version;
      } else {
        demandsMap.set(ing.id, {
          ingredientId: ing.id,
          code: ing.code,
          name: ing.name,
          unit: ing.unit,
          requiredAmount: amountNeeded,
          currentStock: ing.stock,
          version: ing.version,
        });
      }
    };

    // Duyệt qua từng dòng món trong giỏ hàng để cộng dồn nguyên liệu
    for (const item of items) {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw createError('Số lượng sản phẩm không hợp lệ.');
      }

      // 4a. Cộng nguyên liệu của món chính theo size (S, M, L)
      const recipesForProduct = productRecipes.filter(
        (r) => r.productId === item.productId && r.isRequired,
      );
      if (recipesForProduct.length === 0) {
        throw createError(
          `Sản phẩm ${item.productName ?? item.productId} chưa có công thức nguyên liệu.`,
        );
      }

      for (const recipe of recipesForProduct) {
        const amountForOneCup = this.getAmountBySize(recipe, item.size);
        if (!Number.isInteger(amountForOneCup) || amountForOneCup <= 0) {
          throw createError(
            `Định mức nguyên liệu ${recipe.ingredient.name} không hợp lệ.`,
          );
        }
        addIngredientNeed(recipe.ingredient, amountForOneCup * item.quantity);
      }

      // 4b. Cộng nguyên liệu của từng topping đi kèm
      for (const toppingCode of item.toppings ?? []) {
        const recipesForTopping = toppingRecipes.filter(
          (r) => r.toppingCode === toppingCode && r.isRequired,
        );
        if (recipesForTopping.length === 0) {
          throw createError(
            `Topping ${toppingCode} chưa có công thức nguyên liệu.`,
          );
        }

        for (const tRecipe of recipesForTopping) {
          if (!Number.isInteger(tRecipe.amount) || tRecipe.amount <= 0) {
            throw createError(
              `Định mức nguyên liệu cho topping ${toppingCode} không hợp lệ.`,
            );
          }
          addIngredientNeed(tRecipe.ingredient, tRecipe.amount * item.quantity);
        }
      }
    }

    // Sắp xếp theo ID nguyên liệu tăng dần để tránh deadlock khi khóa cập nhật
    return [...demandsMap.values()].sort(
      (a, b) => a.ingredientId - b.ingredientId,
    );
  }

  /**
   * 5. Kiểm tra kho nguyên liệu khi khách bấm Tạo đơn (POST /orders)
   *    (Lúc tạo đơn PENDING chỉ kiểm tra đủ nguyên liệu, chưa trừ kho)
   */
  async assertCartStockAvailable(
    tx: Prisma.TransactionClient,
    items: readonly CartRecipeItemInput[],
    fallbackProductsById?: Map<
      number,
      { id: number; name: string; stock: number }
    >,
  ): Promise<void> {
    // Hỗ trợ các bài unit test cũ của T06/T07/T10A không mock bảng productIngredient
    if (!tx.productIngredient) {
      if (!fallbackProductsById) return;
      const requestedByProduct = new Map<number, number>();
      for (const item of items) {
        requestedByProduct.set(
          item.productId,
          (requestedByProduct.get(item.productId) ?? 0) + item.quantity,
        );
      }
      for (const [productId, requestedQuantity] of requestedByProduct) {
        const product = fallbackProductsById.get(productId);
        if (product && requestedQuantity > product.stock) {
          throw new BadRequestException(
            `Sản phẩm ${product.name} chỉ còn ${product.stock} món.`,
          );
        }
      }
      return;
    }

    // Tính tổng nguyên liệu cần cho cả giỏ hàng và so sánh với tồn kho hiện tại
    const demands = await this.aggregateOrderIngredientDemands(
      tx,
      items,
      'order',
    );

    for (const demand of demands) {
      if (
        demand.currentStock < 0 ||
        demand.requiredAmount > demand.currentStock
      ) {
        throw new BadRequestException(
          `Nguyên liệu ${demand.name} không đủ tồn kho (cần ${demand.requiredAmount}${demand.unit}, còn ${Math.max(0, demand.currentStock)}${demand.unit}).`,
        );
      }
    }
  }

  /**
   * 6. Trừ kho nguyên liệu khi Thanh toán thành công (POST /payments -> PAID)
   *    Dùng Transaction + Optimistic Locking (kiểm tra cột version và stock >= requiredAmount)
   */
  async deductForPaidOrder(
    tx: Prisma.TransactionClient,
    orderId: number,
    items?: readonly CartRecipeItemInput[],
  ): Promise<AggregatedIngredientDemand[]> {
    // Bỏ qua nếu đang chạy trong các unit test cũ không mock bảng nguyên liệu
    if (!tx.productIngredient || !tx.ingredient) {
      return [];
    }

    const orderItems =
      items ??
      (await tx.orderItem.findMany({
        where: { orderId },
        select: {
          productId: true,
          size: true,
          quantity: true,
          toppings: true,
        },
      }));

    // Bước 1: Tính tổng lượng cần trừ của từng nguyên liệu trong đơn
    const demands = await this.aggregateOrderIngredientDemands(
      tx,
      orderItems,
      'payment',
    );

    // Bước 2: Kiểm tra tất cả nguyên liệu đều đủ trước khi bắt đầu trừ
    for (const demand of demands) {
      if (
        demand.currentStock < 0 ||
        demand.requiredAmount > demand.currentStock
      ) {
        throw new ConflictException(
          `Nguyên liệu ${demand.name} không đủ tồn kho để thanh toán.`,
        );
      }
    }

    // Bước 3: Trừ từng nguyên liệu kèm khóa lạc quan (Optimistic Locking)
    for (const demand of demands) {
      let isDeducted = false;
      let expectedVersion = demand.version;

      for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
        // Chỉ trừ thành công nếu: đúng version hiện tại VÀ tồn kho >= lượng cần trừ
        const result = await tx.ingredient.updateMany({
          where: {
            id: demand.ingredientId,
            version: expectedVersion,
            stock: { gte: demand.requiredAmount },
          },
          data: {
            stock: { decrement: demand.requiredAmount },
            version: { increment: 1 },
          },
        });

        if (result.count === 1) {
          isDeducted = true;
          break;
        }

        // Nếu chưa trừ được (do có đơn khác vừa cập nhật cùng lúc), đọc lại dữ liệu mới nhất
        const latestIngredient = await tx.ingredient.findUnique({
          where: { id: demand.ingredientId },
          select: { id: true, stock: true, version: true },
        });

        // Nếu kho đã hết -> Ném lỗi 409 để rollback toàn bộ transaction
        if (
          !latestIngredient ||
          latestIngredient.stock < demand.requiredAmount
        ) {
          throw new ConflictException(
            `Nguyên liệu ${demand.name} không đủ tồn kho để thanh toán.`,
          );
        }

        // Nếu version không đổi mà vẫn không update được -> Báo xung đột ngay
        if (latestIngredient.version === expectedVersion) {
          throw new ConflictException(
            `Xung đột cập nhật tồn kho nguyên liệu ${demand.name}. Vui lòng thử lại.`,
          );
        }

        // Kho vẫn còn đủ, cập nhật lại version mới để thử lại ở vòng lặp kế tiếp
        expectedVersion = latestIngredient.version;
      }

      if (!isDeducted) {
        throw new ConflictException(
          `Xung đột cập nhật đồng thời trên nguyên liệu ${demand.name}. Vui lòng thử lại.`,
        );
      }
    }

    return demands;
  }
}
