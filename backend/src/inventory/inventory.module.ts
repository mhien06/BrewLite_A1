import { InventoryController } from './inventory.controller.js';
import { AvailabilityService } from './availability.service.js';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { InventoryService } from './inventory.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [InventoryController],
  providers: [InventoryService, AvailabilityService],
  exports: [InventoryService],
})
export class InventoryModule {}
