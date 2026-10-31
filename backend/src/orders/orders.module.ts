import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PromotionsModule } from '../promotions/promotions.module.js';
import { OrdersController } from './orders.controller.js';
import { OrderStateService } from './order-state.service.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [PrismaModule, AuthModule, PromotionsModule, InventoryModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderStateService],
  exports: [OrderStateService],
})
export class OrdersModule {}
