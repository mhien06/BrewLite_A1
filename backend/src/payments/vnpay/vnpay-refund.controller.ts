import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { ParseDatabaseIdPipe } from '../../common/pipes/parse-database-id.pipe.js';
import { StaffGuard } from '../../staff/staff.guard.js';
import { VnpayRefundService } from './vnpay-refund.service.js';

@Controller('payments/vnpay/refunds')
@UseGuards(JwtAuthGuard, StaffGuard)
@ApiTags('VNPay Refunds')
@ApiBearerAuth('access-token')
export class VnpayRefundController {
  constructor(private readonly refunds: VnpayRefundService) {}

  @Post(':id/retry')
  @ApiOperation({ summary: 'Retry a refund explicitly rejected by VNPay' })
  @ApiParam({ name: 'id', type: Number, description: 'Refund record ID' })
  retry(@Param('id', ParseDatabaseIdPipe) id: number) {
    return this.refunds.retryRejectedRefund(id);
  }
}