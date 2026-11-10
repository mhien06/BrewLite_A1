import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderItemDto } from './create-order-item.dto.js';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrderDto {
  @ApiPropertyOptional({ maxLength: 50, example: 'SUMMER10' })
  @IsOptional()
  @IsString({ message: 'Mã khuyến mãi phải là chuỗi ký tự.' })
  @MaxLength(50, { message: 'Mã khuyến mãi không được vượt quá 50 ký tự.' })
  promotionCode?: string;

  @ApiProperty({ type: () => [CreateOrderItemDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
