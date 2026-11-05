import { MAX_DATABASE_ID } from '../../common/database-id.js';
import { IsBoolean, IsIn, IsInt, Max, Min } from 'class-validator';
import { PaymentMethod } from '../../generated/prisma/client.js';

export class CreatePaymentDto {
  @IsInt()
  @Min(1)
  @Max(MAX_DATABASE_ID)
  orderId!: number;

  @IsIn([PaymentMethod.WALLET, PaymentMethod.CARD])
  method!: typeof PaymentMethod.WALLET | typeof PaymentMethod.CARD;

  @IsBoolean()
  simulateSuccess!: boolean;
}
