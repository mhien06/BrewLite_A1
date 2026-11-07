import { paymentDeadline } from '../order-expiry.service.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  OrderStatus,
  PaymentMethod,
  Prisma,
} from '../../generated/prisma/client.js';
import { OrderStateService } from '../../orders/order-state.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateVnpayPaymentDto } from './create-vnpay-payment.dto.js';
import { getVnpayConfig, type VnpayConfig } from './vnpay-config.js';
import { buildVnpayPaymentUrl } from './vnpay-url.js';

const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

type StoredVnpayPayment = {
  id: number;
  orderId: number;
  amount: number;
  status: OrderStatus;
  method: PaymentMethod;
  providerTxnRef: string | null;
  expiresAt: Date | null;
  createdAt: Date;
};

@Injectable()
export class VnpayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderState: OrderStateService,
  ) {}

  async createPaymentUrl(
    userId: number,
    dto: CreateVnpayPaymentDto,
    rawIdempotencyKey: string | undefined,
    rawIpAddress: string,
  ) {
    const config = getVnpayConfig();
    const idempotencyKey = this.validateIdempotencyKey(rawIdempotencyKey);

    const savedPayment = await this.prisma.payment.findUnique({
      where: {
        userId_idempotencyKey: {
          userId,
          idempotencyKey,
        },
      },
    });

    if (savedPayment) {
      const order = await this.prisma.order.findFirst({
        where: { id: dto.orderId, userId },
        select: { status: true },
      });
      if (
        !order ||
        !(
          [OrderStatus.PENDING, OrderStatus.PAYMENT_FAILED] as OrderStatus[]
        ).includes(order.status)
      ) {
        throw new ConflictException(
          'Đơn không còn cho phép thanh toán. Vui lòng xem chi tiết đơn.',
        );
      }
      return this.buildReplayResponse(savedPayment, dto, rawIpAddress, config);
    }

    const createdAt = new Date();
    const expiresAt = new Date(
      createdAt.getTime() + config.paymentExpiryMinutes * 60 * 1000,
    );
    const providerTxnRef = this.createTransactionReference();

    const payment = await this.prisma.$transaction(
      async (transaction) => {
        await this.lockPaymentCreation(
          transaction,
          userId,
          dto.orderId,
          idempotencyKey,
        );

        const savedInsideTransaction = await transaction.payment.findUnique({
          where: {
            userId_idempotencyKey: {
              userId,
              idempotencyKey,
            },
          },
        });

        if (savedInsideTransaction) {
          const existingOrder = await transaction.order.findFirst({
            where: { id: dto.orderId, userId },
            select: { status: true },
          });
          if (
            !existingOrder ||
            !(
              [OrderStatus.PENDING, OrderStatus.PAYMENT_FAILED] as OrderStatus[]
            ).includes(existingOrder.status)
          ) {
            throw new ConflictException('Đơn không còn cho phép thanh toán.');
          }
          this.buildReplayResponse(
            savedInsideTransaction,
            dto,
            rawIpAddress,
            config,
          );
          return savedInsideTransaction;
        }

        const order = await transaction.order.findFirst({
          where: {
            id: dto.orderId,
            userId,
          },
          select: {
            id: true,
            status: true,
            total: true,
            createdAt: true,
          },
        });

        if (!order) {
          throw new NotFoundException('Không tìm thấy đơn hàng.');
        }

        if (order.status === OrderStatus.PAID) {
          throw new ConflictException('Đơn hàng đã được thanh toán.');
        }

        if (
          order.status !== OrderStatus.PENDING &&
          order.status !== OrderStatus.PAYMENT_FAILED
        ) {
          throw new ConflictException(
            `Không thể thanh toán đơn ở trạng thái ${order.status}.`,
          );
        }

        const activePayment = await transaction.payment.findFirst({
          where: {
            orderId: order.id,
            method: PaymentMethod.VNPAY,
            status: OrderStatus.PENDING,
            expiresAt: { gt: createdAt },
          },
          select: { id: true },
        });

        const latestPayment = await transaction.payment.findFirst({
          where: { orderId: order.id },
          orderBy: { id: 'desc' },
        });
        if (
          order.createdAt &&
          paymentDeadline(
            order.createdAt,
            latestPayment?.expiresAt,
          ).getTime() <= createdAt.getTime()
        ) {
          throw new ConflictException(
            'Đơn đã hết thời hạn thanh toán. Vui lòng đặt đơn mới.',
          );
        }

        if (activePayment) {
          throw new ConflictException(
            'Đơn hàng đang có một giao dịch VNPAY chưa hết hạn.',
          );
        }

        if (order.status === OrderStatus.PAYMENT_FAILED) {
          await this.orderState.transition(
            order.id,
            OrderStatus.PENDING,
            transaction,
          );
        }

        return transaction.payment.create({
          data: {
            userId,
            orderId: order.id,
            idempotencyKey,
            method: PaymentMethod.VNPAY,
            simulateSuccess: null,
            amount: order.total,
            status: OrderStatus.PENDING,
            providerTxnRef,
            expiresAt,
          },
        });
      },
      { maxWait: 15_000, timeout: 20_000 },
    );

    return this.toPaymentUrlResponse(payment, dto.locale, rawIpAddress, config);
  }

  private validateIdempotencyKey(rawKey?: string): string {
    const key = rawKey?.trim();

    if (!key || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      throw new BadRequestException(
        `Idempotency-Key phải từ 1 đến ${MAX_IDEMPOTENCY_KEY_LENGTH} ký tự.`,
      );
    }

    return key;
  }

  private async lockPaymentCreation(
    transaction: Prisma.TransactionClient,
    userId: number,
    orderId: number,
    idempotencyKey: string,
  ): Promise<void> {
    if (typeof transaction.$executeRaw !== 'function') {
      return;
    }

    const lockName = `vnpay:${userId}:${idempotencyKey}`;

    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${lockName}))
    `;

    await transaction.$executeRaw`
      SELECT id
      FROM "Order"
      WHERE id = ${orderId} AND "userId" = ${userId}
      FOR UPDATE
    `;
  }

  private buildReplayResponse(
    payment: StoredVnpayPayment,
    dto: CreateVnpayPaymentDto,
    ipAddress: string,
    config: VnpayConfig,
  ) {
    if (
      payment.orderId !== dto.orderId ||
      payment.method !== PaymentMethod.VNPAY
    ) {
      throw new ConflictException(
        'Idempotency-Key đã được dùng với dữ liệu khác.',
      );
    }

    if (payment.status !== OrderStatus.PENDING) {
      throw new ConflictException(
        'Giao dịch này đã được xử lý. Hãy dùng khóa mới khi thử lại.',
      );
    }

    if (!payment.expiresAt || payment.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException(
        'Giao dịch đã hết hạn. Hãy dùng khóa mới để thử lại.',
      );
    }

    return this.toPaymentUrlResponse(payment, dto.locale, ipAddress, config);
  }

  private toPaymentUrlResponse(
    payment: StoredVnpayPayment,
    locale: 'vn' | 'en',
    rawIpAddress: string,
    config: VnpayConfig,
  ) {
    if (!payment.providerTxnRef || !payment.expiresAt) {
      throw new ConflictException('Giao dịch VNPAY thiếu thông tin bắt buộc.');
    }

    const paymentUrl = buildVnpayPaymentUrl(
      {
        orderId: payment.orderId,
        amount: payment.amount,
        txnRef: payment.providerTxnRef,
        ipAddress: this.normalizeIpAddress(rawIpAddress),
        locale,
        createdAt: payment.createdAt,
        expiresAt: payment.expiresAt,
      },
      config,
    );

    return {
      orderId: payment.orderId,
      paymentId: payment.id,
      txnRef: payment.providerTxnRef,
      amount: payment.amount,
      status: payment.status,
      paymentUrl,
      expiresAt: payment.expiresAt,
    };
  }

  private normalizeIpAddress(rawIpAddress: string): string {
    const firstAddress = rawIpAddress
      .split(',')[0]
      ?.trim()
      .replace(/^::ffff:/, '');

    return firstAddress || '127.0.0.1';
  }

  private createTransactionReference(): string {
    return `BL${Date.now()}${randomBytes(8).toString('hex').toUpperCase()}`;
  }
}
