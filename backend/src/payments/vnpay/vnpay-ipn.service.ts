import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
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
    // Luôn khóa Order trước Payment, cùng thứ tự với hủy đơn để tránh deadlock.
    const reference = await transaction.payment.findUnique({
      where: { providerTxnRef: txnRef },
    });
    if (!reference) return this.response('01', 'Order not Found');
    await this.lockOrder(transaction, reference.orderId);
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

    if (
      successful &&
      payment.expiresAt &&
      payment.expiresAt.getTime() <= Date.now() &&
      (order.status === OrderStatus.PENDING ||
        order.status === OrderStatus.PAYMENT_FAILED)
    ) {
      const latest = await transaction.payment.findFirst({
        where: { orderId: order.id },
        orderBy: { id: 'desc' },
      });
      if (latest?.id === payment.id) {
        await this.orderState.transition(
          order.id,
          OrderStatus.CANCELLED,
          transaction,
          {
            cancelledAt: new Date(),
            cancellationSource: 'SYSTEM',
            cancelledById: null,
            cancellationReason:
              'Thanh toán được xác nhận sau khi giao dịch hết hạn.',
          },
        );
      }
      await this.recordReceivedPayment(
        transaction,
        payment.id,
        params,
        'Thanh toán VNPay đến sau thời hạn thanh toán của đơn hàng.',
      );
      return this.response('00', 'Confirm Success');
    }

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
      // Đơn hủy hoặc đã được trả bằng giao dịch khác: lưu khoản tiền đến trễ để đối soát.
      await this.recordReceivedPayment(
        transaction,
        payment.id,
        params,
        'Đã nhận thanh toán VNPay nhưng nguyên liệu không còn đủ để thực hiện đơn.',
      );
      return this.response('00', 'Confirm Success');
    }

    const paidAt = new Date();
    const hasSavepoint = typeof transaction.$executeRaw === 'function';
    if (hasSavepoint)
      await transaction.$executeRaw`SAVEPOINT inventory_deduction`;
    try {
      await this.inventory.deductForPaidOrder(transaction, payment.orderId);
    } catch (error) {
      if (!(
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ))
        throw error;
      // Khôi phục cả các nguyên liệu đã trừ trước khi một nguyên liệu khác bị thiếu.
      if (hasSavepoint)
        await transaction.$executeRaw`ROLLBACK TO SAVEPOINT inventory_deduction`;
      await this.orderState.transition(
        payment.orderId,
        OrderStatus.CANCELLED,
        transaction,
        {
          cancelledAt: paidAt,
          cancellationSource: 'SYSTEM',
          cancelledById: null,
          cancellationReason:
            'Đã nhận thanh toán nhưng nguyên liệu không còn đủ. Cần đối soát thủ công.',
        },
      );
      await this.recordReceivedPayment(transaction, payment.id, params);
      return this.response('00', 'Confirm Success');
    }
    if (hasSavepoint)
      await transaction.$executeRaw`RELEASE SAVEPOINT inventory_deduction`;

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
    const latest =
      typeof transaction.payment.findFirst === 'function'
        ? await transaction.payment.findFirst({
            where: { orderId: payment.orderId },
            orderBy: { id: 'desc' },
          })
        : null;
    // Callback của lần thử cũ không được làm hỏng lần thử mới đang chờ.
    if (
      currentStatus === OrderStatus.PENDING &&
      (!latest || latest.id === payment.id)
    ) {
      await this.orderState.transition(
        payment.orderId,
        OrderStatus.PAYMENT_FAILED,
        transaction,
        {
          paymentMethod: PaymentMethod.VNPAY,
          paidAt: null,
        },
      );
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

  private async recordReceivedPayment(
    tx: Prisma.TransactionClient,
    id: number,
    params: VnpayParams,
    refundReason?: string,
  ) {
    const now = new Date();
    const payment = await tx.payment.findUnique({ where: { id } });
    if (!payment) return;
    await tx.payment.update({
      where: { id },
      data: {
        status: OrderStatus.PAID,
        paidAt: now,
        ...this.providerResult(params),
        ...(refundReason && payment.method === PaymentMethod.VNPAY
          ? {
              refundStatus: payment.refundStatus ?? 'PENDING',
              refundRequestedAt: payment.refundRequestedAt ?? now,
              refundAmount: payment.refundAmount ?? payment.amount,
              refundReason: payment.refundReason ?? refundReason,
            }
          : {}),
      },
    });
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
