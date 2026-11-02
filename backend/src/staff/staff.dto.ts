import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class AdjustStockDto {
  @IsInt() @Min(-1000000) @Max(1000000) delta!: number;
  @IsInt() @Min(1) version!: number;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reason!: string;
}
export class UpdateOrderStatusDto {
  @IsIn(['PREPARING', 'READY', 'COMPLETED', 'CANCELLED']) status!:
    'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';
}
