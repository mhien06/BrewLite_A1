import { ParseDatabaseIdPipe } from '../common/pipes/parse-database-id.pipe.js';
import { Controller, Get, Param } from '@nestjs/common';
import type { Product } from '../generated/prisma/client.js';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service.js';

@Controller('products')
@ApiTags('Products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List products' })
  findAll(): Promise<Product[]> {
    return this.productsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product by ID' })
  @ApiParam({ name: 'id', type: Number })
  findOne(@Param('id', ParseDatabaseIdPipe) id: number): Promise<Product> {
    return this.productsService.findOne(id);
  }
}
