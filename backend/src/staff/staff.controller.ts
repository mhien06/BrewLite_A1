import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator.js';
import { StaffGuard } from './staff.guard.js';
import { StaffService } from './staff.service.js';
import { AdjustStockDto, UpdateOrderStatusDto } from './staff.dto.js';

@Controller('staff')
@UseGuards(JwtAuthGuard, StaffGuard)
export class StaffController {
  constructor(private readonly staff: StaffService) {}
  @Get('me') me(@CurrentUser() user: AuthUser) {
    return { id: user.id, role: 'STAFF' };
  }
  @Get('ingredients') ingredients() {
    return this.staff.ingredients();
  }
  @Get('recipes') recipes() {
    return this.staff.recipes();
  }
  @Get('topping-recipes') toppingRecipes() {
    return this.staff.toppingRecipes();
  }
  @Get('movements') movements() {
    return this.staff.movements();
  }
  @Patch('ingredients/:id') adjust(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdjustStockDto,
  ) {
    return this.staff.adjustStock(user.id, id, dto);
  }
  @Get('orders') orders() {
    return this.staff.orders();
  }
  @Patch('orders/:id/status') status(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.staff.updateStatus(id, dto, user.id);
  }
  @Get('loyalty') loyalty() {
    return this.staff.loyalty();
  }
}
