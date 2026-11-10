import { ParseDatabaseIdPipe } from '../common/pipes/parse-database-id.pipe.js';
import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator.js';
import { StaffGuard } from './staff.guard.js';
import { StaffService } from './staff.service.js';
import { AdjustStockDto, UpdateOrderStatusDto } from './staff.dto.js';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

@Controller('staff')
@UseGuards(JwtAuthGuard, StaffGuard)
@ApiTags('Staff')
@ApiBearerAuth('access-token')
export class StaffController {
  constructor(private readonly staff: StaffService) {}
  @Get('me') @ApiOperation({ summary: 'Get the authenticated staff account' }) me(@CurrentUser() user: AuthUser) {
    return { id: user.id, role: 'STAFF' };
  }
  @Get('ingredients') @ApiOperation({ summary: 'List ingredients and stock' }) ingredients() {
    return this.staff.ingredients();
  }
  @Get('recipes') @ApiOperation({ summary: 'List product recipes' }) recipes() {
    return this.staff.recipes();
  }
  @Get('topping-recipes') @ApiOperation({ summary: 'List topping recipes' }) toppingRecipes() {
    return this.staff.toppingRecipes();
  }
  @Get('movements') @ApiOperation({ summary: 'List stock movements' }) movements() {
    return this.staff.movements();
  }
  @Patch('ingredients/:id')
  @ApiOperation({ summary: 'Adjust ingredient stock' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: AdjustStockDto })
  adjust(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseDatabaseIdPipe) id: number,
    @Body() dto: AdjustStockDto,
  ) {
    return this.staff.adjustStock(user.id, id, dto);
  }
  @Get('orders') @ApiOperation({ summary: 'List orders for staff' }) orders() {
    return this.staff.orders();
  }
  @Patch('orders/:id/status')
  @ApiOperation({ summary: 'Update an order status' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateOrderStatusDto })
  status(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseDatabaseIdPipe) id: number,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.staff.updateStatus(id, dto, user.id);
  }
  @Get('loyalty') @ApiOperation({ summary: 'List customer loyalty balances' }) loyalty() {
    return this.staff.loyalty();
  }
}
