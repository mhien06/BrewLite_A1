import { Injectable, NotFoundException } from '@nestjs/common';
import type { Product } from '../generated/prisma/client.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService = new InventoryService(
      prisma,
    ),
  ) {}

  /**
   * Lấy danh sách thực đơn (GET /products)
   * Số lượng tồn kho (stock) của mỗi món được tính từ kho nguyên liệu theo công thức.
   */
  async findAll(): Promise<Product[]> {
    const products = await this.prisma.product.findMany({
      orderBy: { id: 'asc' },
    });

    if (!this.prisma.productIngredient) {
      return products;
    }

    return Promise.all(
      products.map(async (product) => ({
        ...product,
        stock: await this.inventoryService.calculateProductAvailableStock(
          product.id,
          'S',
        ),
      })),
    );
  }

  /**
   * Lấy chi tiết 1 sản phẩm (GET /products/:id)
   */
  async findOne(id: number): Promise<Product> {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    if (!this.prisma.productIngredient) {
      return product;
    }

    return {
      ...product,
      stock: await this.inventoryService.calculateProductAvailableStock(
        product.id,
        'S',
      ),
    };
  }
}
