import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_DATABASE_ID } from '../../common/database-id.js';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateVnpayPaymentDto {
  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_DATABASE_ID)
  orderId!: number;

  @ApiPropertyOptional({ enum: ['vn', 'en'], default: 'vn' })
  @IsOptional()
  @IsIn(['vn', 'en'])
  locale: 'vn' | 'en' = 'vn';
}
