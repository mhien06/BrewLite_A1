import { Module } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service.js';
import { PointCompensationService } from './point-compensation.service.js';

@Module({
  providers: [LoyaltyService, PointCompensationService],
  exports: [LoyaltyService, PointCompensationService],
})
export class LoyaltyModule {}
