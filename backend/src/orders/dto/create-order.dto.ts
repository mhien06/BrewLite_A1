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

export class CreateOrderDto {
  @IsOptional()
  @IsString({ message: 'Mã khuyến mãi phải là chuỗi ký tự.' })
  @MaxLength(50, { message: 'Mã khuyến mãi không được vượt quá 50 ký tự.' })
  promotionCode?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
