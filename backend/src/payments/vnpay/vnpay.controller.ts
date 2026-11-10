import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  CurrentUser,
  type AuthUser,
} from '../../auth/decorators/current-user.decorator.js';
import { CustomerGuard } from '../../auth/guards/customer.guard.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { CreateVnpayPaymentDto } from './create-vnpay-payment.dto.js';
import { VnpayService } from './vnpay.service.js';
import { VnpayIpnService } from './vnpay-ipn.service.js';
import { VnpayReturnService } from './vnpay-return.service.js';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

@Controller('payments/vnpay')
@ApiTags('Payments')
export class VnpayController {
  constructor(
    private readonly vnpayService: VnpayService,
    private readonly vnpayIpnService: VnpayIpnService,
    private readonly vnpayReturnService: VnpayReturnService,
  ) {}

  @Post('create-url')
  @UseGuards(JwtAuthGuard, CustomerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a VNPay checkout URL' })
  @ApiBody({ type: CreateVnpayPaymentDto })
  createPaymentUrl(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateVnpayPaymentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
  ) {
    return this.vnpayService.createPaymentUrl(
      user.id,
      dto,
      idempotencyKey,
      this.getClientIpAddress(request),
    );
  }

  @Get('ipn')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'VNPay server-to-server payment notification' })
  @ApiQuery({ name: 'vnp_*', required: false, description: 'VNPay notification query fields' })
  handleIpn(@Query() query: Record<string, unknown>) {
    return this.vnpayIpnService.handle(query);
  }

  @Get('return')
  @ApiOperation({ summary: 'Handle the VNPay browser return and redirect to the frontend' })
  async handleReturn(
    @Query() query: Record<string, unknown>,
    @Res() response: Response,
  ) {
    const redirectUrl =
      await this.vnpayReturnService.buildFrontendRedirect(query);

    return response.redirect(HttpStatus.FOUND, redirectUrl);
  }

  private getClientIpAddress(request: Request): string {
    const forwardedAddress = request.headers['x-forwarded-for'];

    if (typeof forwardedAddress === 'string') {
      return forwardedAddress;
    }

    if (Array.isArray(forwardedAddress)) {
      return forwardedAddress[0] ?? request.ip;
    }

    return request.ip || request.socket.remoteAddress || '127.0.0.1';
  }
}
