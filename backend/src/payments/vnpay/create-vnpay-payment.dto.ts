import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_DATABASE_ID } from '../../common/database-id.js';

export class CreateVnpayPaymentDto {
  @IsInt()
  @Min(1)
  @Max(MAX_DATABASE_ID)
  orderId!: number;

  @IsOptional()
  @IsIn(['vn', 'en'])
  locale: 'vn' | 'en' = 'vn';
}
