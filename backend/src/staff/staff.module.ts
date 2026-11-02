import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';
import { StaffGuard } from './staff.guard.js';
@Module({
  imports: [AuthModule, OrdersModule, PrismaModule],
  controllers: [StaffController],
  providers: [StaffService, StaffGuard],
})
export class StaffModule {}
