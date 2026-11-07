import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { StaffGuard } from '../../staff/staff.guard.js';
import { ParseDatabaseIdPipe } from '../../common/pipes/parse-database-id.pipe.js';
import { VnpayRefundService } from './vnpay-refund.service.js';

@Controller('payments/vnpay/refunds')
@UseGuards(JwtAuthGuard, StaffGuard)
export class VnpayRefundController {
  constructor(private readonly refunds: VnpayRefundService) {}
  @Post(':id/retry') retry(@Param('id', ParseDatabaseIdPipe) id: number) {
    return this.refunds.retryRejectedRefund(id);
  }
}
