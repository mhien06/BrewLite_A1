import { MAX_DATABASE_ID } from '../../common/database-id.js';
import { IsBoolean, IsIn, IsInt, Max, Min } from 'class-validator';
import { PaymentMethod } from '../../generated/prisma/client.js';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePaymentDto {
  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_DATABASE_ID)
  orderId!: number;

  @ApiProperty({ enum: [PaymentMethod.WALLET, PaymentMethod.CARD] })
  @IsIn([PaymentMethod.WALLET, PaymentMethod.CARD])
  method!: typeof PaymentMethod.WALLET | typeof PaymentMethod.CARD;

  @ApiProperty({ description: 'Whether to simulate a successful payment' })
  @IsBoolean()
  simulateSuccess!: boolean;
}
