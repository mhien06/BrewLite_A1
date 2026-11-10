import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { CreateOrderItemDto } from '../../orders/dto/create-order-item.dto.js';
import { ApiProperty } from '@nestjs/swagger';

export class CheckCartDto {
  @ApiProperty({ type: () => [CreateOrderItemDto], maxItems: 100 })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
