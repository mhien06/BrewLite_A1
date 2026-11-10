import { MAX_DATABASE_ID } from '../../common/database-id.js';
import { ArrayMaxSize, IsArray, IsIn, IsInt, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrderItemDto {
  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_DATABASE_ID)
  productId!: number;

  @ApiProperty({ enum: ['S', 'M', 'L'] })
  @IsIn(['S', 'M', 'L'])
  size!: 'S' | 'M' | 'L';

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ type: [String], enum: ['pearls', 'cream', 'jelly'], maxItems: 30, example: ['pearls'] })
  @IsArray()
  @ArrayMaxSize(30)
  @IsIn(['pearls', 'cream', 'jelly'], { each: true })
  toppings: string[] = [];
}
