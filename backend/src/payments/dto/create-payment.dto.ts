import { IsBoolean, IsEnum, IsInt, Min } from 'class-validator';
import { PaymentMethod } from '../../generated/prisma/client.js';

export class CreatePaymentDto {
  @IsInt()
  @Min(1)
  orderId!: number;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsBoolean()
  simulateSuccess!: boolean;
}
