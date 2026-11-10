import { CustomerGuard } from '../auth/guards/customer.guard.js';
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { PaymentsService } from './payments.service.js';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';

@Controller('payments')
@UseGuards(JwtAuthGuard)
@ApiTags('Payments')
@ApiBearerAuth('access-token')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @UseGuards(CustomerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create a payment for an order' })
  @ApiBody({ type: CreatePaymentDto })
  @ApiHeader({ name: 'idempotency-key', required: false, description: 'Optional key to safely retry the request' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.paymentsService.create(user.id, dto, idempotencyKey);
  }
}
