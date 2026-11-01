import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { LoyaltyModule } from '../loyalty/loyalty.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [PrismaModule, OrdersModule, LoyaltyModule, InventoryModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
