import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AvailabilityService } from './availability.service.js';
import { CheckCartDto } from './dto/check-cart.dto.js';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

@Controller('inventory')
@ApiTags('Inventory')
export class InventoryController {
  constructor(private readonly availability: AvailabilityService) {}
  // Khách chưa đăng nhập cũng cần biết món/topping còn hay hết.
  @Post('check-cart')
  @HttpCode(200)
  @ApiOperation({ summary: 'Check product and topping availability for a cart' })
  @ApiBody({ type: CheckCartDto })
  checkCart(@Body() dto: CheckCartDto) {
    return this.availability.checkCart(dto);
  }
}
