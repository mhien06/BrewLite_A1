import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { LoyaltyModule } from '../loyalty/loyalty.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { VnpayController } from './vnpay/vnpay.controller.js';
import { VnpayService } from './vnpay/vnpay.service.js';
import { VnpayIpnService } from './vnpay/vnpay-ipn.service.js';
import { VnpayReturnService } from './vnpay/vnpay-return.service.js';
import { VnpayTransactionApiService } from './vnpay/vnpay-transaction-api.service.js';

@Module({
  imports: [PrismaModule, OrdersModule, LoyaltyModule, InventoryModule],
  controllers: [PaymentsController, VnpayController],
  providers: [
    PaymentsService,
    VnpayService,
    VnpayIpnService,
    VnpayReturnService,
    VnpayTransactionApiService,
  ],
  exports: [VnpayTransactionApiService],
})
export class PaymentsModule {}
