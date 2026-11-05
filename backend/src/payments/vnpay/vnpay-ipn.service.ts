import { Injectable, Logger } from '@nestjs/common';
import {
  OrderStatus,
  PaymentMethod,
  Prisma,
} from '../../generated/prisma/client.js';
import { InventoryService } from '../../inventory/inventory.service.js';
import { LoyaltyService } from '../../loyalty/loyalty.service.js';
import { OrderStateService } from '../../orders/order-state.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { getVnpayConfig } from './vnpay-config.js';
import {
  normalizeVnpayQuery,
  verifyVnpaySignature,
  type VnpayParams,
} from './vnpay-signature.js';

export interface VnpayIpnResponse {
  RspCode: string;
  Message: string;
}

@Injectable()
export class VnpayIpnService {
  private readonly logger = new Logger(VnpayIpnService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderState: OrderStateService,
    private readonly inventory: InventoryService,
    private readonly loyalty: LoyaltyService,
  ) {}

  async handle(rawQuery: Record<string, unknown>): Promise<VnpayIpnResponse> {
    try {
      const config = getVnpayConfig();
      const params = normalizeVnpayQuery(rawQuery);

      if (
        !params ||
        !verifyVnpaySignature(params, config.hashSecret) ||
        params.vnp_TmnCode !== config.tmnCode
      ) {
        return this.response('97', 'Invalid Checksum');
      }

      const txnRef = params.vnp_TxnRef;

      if (!txnRef) {
        return this.response('01', 'Order not Found');
      }

      return await this.prisma.$transaction(
        (transaction) => this.processCallback(transaction, params, txnRef),
        { maxWait: 15_000, timeout: 20_000 },
      );
    } catch (error) {
      this.logger.error(
        'VNPAY IPN processing failed.',
        error instanceof Error ? error.stack : undefined,
      );

      return this.response('99', 'Unknown error');
    }
  }

  private async processCallback(
    transaction: Prisma.TransactionClient,
    params: VnpayParams,
    txnRef: string,
  ): Promise<VnpayIpnResponse> {
    await this.lockPayment(transaction, txnRef);

    const payment = await transaction.payment.findUnique({
      where: { providerTxnRef: txnRef },
    });

    if (!payment) {
      return this.response('01', 'Order not Found');
    }

    if (!this.hasValidAmount(params.vnp_Amount, payment.amount)) {
      return this.response('04', 'Invalid Amount');
    }

    if (payment.status !== OrderStatus.PENDING) {
      return this.response('02', 'Order already confirmed');
    }

    await this.lockOrder(transaction, payment.orderId);

    const order = await transaction.order.findUnique({
      where: { id: payment.orderId },
    });

    if (!order || order.userId !== payment.userId) {
      return this.response('01', 'Order not Found');
    }

    if (order.total !== payment.amount) {
      return this.response('04', 'Invalid Amount');
    }

    const successful =
      params.vnp_ResponseCode === '00' && params.vnp_TransactionStatus === '00';

    if (successful) {
      return this.confirmSuccessfulPayment(
        transaction,
        payment,
        order.status,
        params,
      );
    }

    return this.confirmFailedPayment(
      transaction,
      payment,
      order.status,
      params,
    );
  }

  private async confirmSuccessfulPayment(
    transaction: Prisma.TransactionClient,
    payment: {
      id: number;
      orderId: number;
      userId: number;
    },
    currentStatus: OrderStatus,
    params: VnpayParams,
  ): Promise<VnpayIpnResponse> {
    if (currentStatus === OrderStatus.PAYMENT_FAILED) {
      await this.orderState.transition(
        payment.orderId,
        OrderStatus.PENDING,
        transaction,
      );
      currentStatus = OrderStatus.PENDING;
    }

    if (currentStatus !== OrderStatus.PENDING) {
      return this.response('02', 'Order already confirmed');
    }

    const paidAt = new Date();

    await this.inventory.deductForPaidOrder(transaction, payment.orderId);

    const updatedOrder = await this.orderState.transition(
      payment.orderId,
      OrderStatus.PAID,
      transaction,
      {
        paymentMethod: PaymentMethod.VNPAY,
        paidAt,
        inventoryDeducted: true,
      },
    );

    await this.loyalty.awardPointsForPaidOrder(transaction, updatedOrder);

    await transaction.payment.update({
      where: { id: payment.id },
      data: {
        status: OrderStatus.PAID,
        paidAt,
        ...this.providerResult(params),
      },
    });

    return this.response('00', 'Confirm Success');
  }

  private async confirmFailedPayment(
    transaction: Prisma.TransactionClient,
    payment: {
      id: number;
      orderId: number;
    },
    currentStatus: OrderStatus,
    params: VnpayParams,
  ): Promise<VnpayIpnResponse> {
    if (currentStatus === OrderStatus.PENDING) {
      await this.orderState.transition(
        payment.orderId,
        OrderStatus.PAYMENT_FAILED,
        transaction,
        {
          paymentMethod: PaymentMethod.VNPAY,
          paidAt: null,
        },
      );
    } else if (currentStatus !== OrderStatus.PAYMENT_FAILED) {
      return this.response('02', 'Order already confirmed');
    }

    await transaction.payment.update({
      where: { id: payment.id },
      data: {
        status: OrderStatus.PAYMENT_FAILED,
        paidAt: null,
        ...this.providerResult(params),
      },
    });

    return this.response('00', 'Confirm Success');
  }

  private providerResult(params: VnpayParams) {
    return {
      providerTransactionNo: params.vnp_TransactionNo || null,
      providerResponseCode: params.vnp_ResponseCode || null,
      providerTransactionStatus: params.vnp_TransactionStatus || null,
      providerPayDate: params.vnp_PayDate || null,
      providerBankCode: params.vnp_BankCode || null,
    };
  }

  private hasValidAmount(
    rawAmount: string | undefined,
    expectedAmount: number,
  ): boolean {
    if (!rawAmount || !/^\d+$/.test(rawAmount)) {
      return false;
    }

    const amount = Number(rawAmount);

    return Number.isSafeInteger(amount) && amount === expectedAmount * 100;
  }

  private async lockPayment(
    transaction: Prisma.TransactionClient,
    txnRef: string,
  ): Promise<void> {
    if (typeof transaction.$executeRaw !== 'function') {
      return;
    }

    await transaction.$executeRaw`
      SELECT id
      FROM "Payment"
      WHERE "providerTxnRef" = ${txnRef}
      FOR UPDATE
    `;
  }

  private async lockOrder(
    transaction: Prisma.TransactionClient,
    orderId: number,
  ): Promise<void> {
    if (typeof transaction.$executeRaw !== 'function') {
      return;
    }

    await transaction.$executeRaw`
      SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE
    `;
  }

  private response(RspCode: string, Message: string): VnpayIpnResponse {
    return { RspCode, Message };
  }
}
