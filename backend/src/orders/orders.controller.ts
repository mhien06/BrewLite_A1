import { ParseDatabaseIdPipe } from '../common/pipes/parse-database-id.pipe.js';
import { CustomerGuard } from '../auth/guards/customer.guard.js';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrderStateService } from './order-state.service.js';
import { OrdersService } from './orders.service.js';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly orderState: OrderStateService,
  ) {}

  @Post(':id/cancel')
  @UseGuards(CustomerGuard)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseDatabaseIdPipe) id: number,
  ) {
    return this.orderState.transition(
      id,
      'CANCELLED',
      undefined,
      {
        cancelledAt: new Date(),
        cancellationSource: 'CUSTOMER',
        cancelledById: user.id,
        cancellationReason: 'Khách hủy đơn.',
      },
      user.id,
      user.id,
    );
  }

  @Post()
  @UseGuards(CustomerGuard)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(user.id, dto);
  }

  @Get('me')
  findMyOrders(@CurrentUser() user: AuthUser) {
    return this.ordersService.findMyOrders(user.id);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseDatabaseIdPipe) id: number,
  ) {
    return this.ordersService.findOne(user.id, id);
  }
}
