import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class AdjustStockDto {
  @ApiProperty({ description: 'Stock change; positive adds stock, negative removes it', example: 10 })
  @IsInt() @Min(-1000000) @Max(1000000) delta!: number;
  @ApiProperty({ description: 'Current ingredient version for optimistic concurrency', example: 1 })
  @IsInt() @Min(1) version!: number;
  @ApiProperty({ description: 'Reason for the stock adjustment', example: 'Weekly delivery' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reason!: string;
}
export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ['PREPARING', 'READY', 'COMPLETED', 'CANCELLED'] })
  @IsIn(['PREPARING', 'READY', 'COMPLETED', 'CANCELLED']) status!:
    'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}
