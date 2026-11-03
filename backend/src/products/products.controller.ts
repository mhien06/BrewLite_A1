import { ParseDatabaseIdPipe } from '../common/pipes/parse-database-id.pipe.js';
import { Controller, Get, Param } from '@nestjs/common';
import type { Product } from '../generated/prisma/client.js';
import { ProductsService } from './products.service.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(): Promise<Product[]> {
    return this.productsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseDatabaseIdPipe) id: number): Promise<Product> {
    return this.productsService.findOne(id);
  }
}
