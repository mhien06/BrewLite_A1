import { ArrayMaxSize, IsArray, IsIn, IsInt, Min } from 'class-validator';

export class CreateOrderItemDto {
  @IsInt()
  @Min(1)
  productId!: number;

  @IsIn(['S', 'M', 'L'])
  size!: 'S' | 'M' | 'L';

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsArray()
  @ArrayMaxSize(30)
  @IsIn(['pearls', 'cream', 'jelly'], { each: true })
  toppings: string[] = [];
}
