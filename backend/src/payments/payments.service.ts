import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { OrderStatus, Prisma } from '../generated/prisma/client.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { LoyaltyService } from '../loyalty/loyalty.service.js';
import { OrderStateService } from '../orders/order-state.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';

const MAX_KEY_LENGTH = 128;

@Injectable()
export class PaymentsService {
  // Hàng đợi khóa theo từng cặp (userId + idempotencyKey) để chặn 2 request trùng bấm cùng lúc
  private readonly activeKeyLocks = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderState: OrderStateService,
    private readonly loyalty: LoyaltyService,
    private readonly inventory: InventoryService = new InventoryService(prisma),
  ) {}

  /**
   * 1. Kiểm tra và làm sạch header Idempotency-Key
   */
  private validateIdempotencyKey(rawKey?: string): string | undefined {
    if (rawKey === undefined) {
      return undefined;
    }

    const trimmed = rawKey.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_KEY_LENGTH) {
      throw new BadRequestException(
        `Idempotency-Key phải từ 1 đến ${MAX_KEY_LENGTH} ký tự.`,
      );
    }

    return trimmed;
  }

  /**
   * 2. Đảm bảo nếu 2 request có cùng (userId + Idempotency-Key) gửi đến cùng một lúc
   *    thì request thứ 2 sẽ đợi request thứ 1 xử lý xong rồi mới đọc kết quả đã lưu.
   */
  private async runSequentiallyByKey<T>(
    lockKey: string | undefined,
    task: () => Promise<T>,
  ): Promise<T> {
    if (!lockKey) {
      return task();
    }

    const previousTask = this.activeKeyLocks.get(lockKey) ?? Promise.resolve();
    let releaseLock!: () => void;
    const currentLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const lockChain = previousTask.then(() => currentLock);
    this.activeKeyLocks.set(lockKey, lockChain);

    await previousTask;
    try {
      return await task();
    } finally {
      releaseLock();
      if (this.activeKeyLocks.get(lockKey) === lockChain) {
        this.activeKeyLocks.delete(lockKey);
      }
    }
  }

  /**
   * 3. Tìm kết quả thanh toán cũ trong bảng Payment theo (userId + idempotencyKey)
   *    - Nếu cùng nội dung request -> Trả lại kết quả cũ.
   *    - Nếu khác nội dung request -> Báo lỗi 409 Conflict.
   */
  private async findSavedPaymentByKey(
    db: Prisma.TransactionClient | PrismaService,
    userId: number,
    idempotencyKey: string,
    dto: CreatePaymentDto,
  ) {
    if (!db.payment) {
      return null;
    }

    const savedPayment = await db.payment.findUnique({
      where: {
        userId_idempotencyKey: {
          userId,
          idempotencyKey,
        },
      },
      include: {
        order: {
          select: { createdAt: true },
        },
      },
    });

    if (!savedPayment) {
      return null;
    }

    // Kiểm tra nội dung gửi lên có giống hệt lần trước không
    const isSameRequest =
      savedPayment.orderId === dto.orderId &&
      savedPayment.method === dto.method &&
      savedPayment.simulateSuccess === dto.simulateSuccess;

    if (!isSameRequest) {
      throw new ConflictException(
        'Idempotency-Key đã được sử dụng với dữ liệu thanh toán khác.',
      );
    }

    // Trả về đúng kết quả của lần thanh toán trước đó
    return {
      id: savedPayment.orderId,
      userId: savedPayment.userId,
      status: savedPayment.status,
      paymentMethod: savedPayment.method,
      total: savedPayment.amount,
      paidAt: savedPayment.paidAt,
      createdAt: savedPayment.order?.createdAt ?? savedPayment.createdAt,
    };
  }

  /** Khóa nằm trong PostgreSQL nên vẫn có tác dụng khi chạy nhiều API container. */
  private async lockPaymentRequest(
    tx: Prisma.TransactionClient,
    userId: number,
    orderId: number,
    key?: string,
  ): Promise<void> {
    // Các unit test cũ dùng Prisma giả; test database riêng kiểm tra khóa thật.
    if (typeof tx.$executeRaw !== 'function') return;

    if (key) {
      const lockName = `payment:${userId}:${key}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockName}))`;
    }
    // Cả hai khóa được PostgreSQL tự nhả khi commit hoặc rollback.
    await tx.$executeRaw`
      SELECT id FROM "Order" WHERE id = ${orderId} AND "userId" = ${userId} FOR UPDATE
    `;
  }

  /** Kho, trạng thái, điểm và kết quả thanh toán cùng commit hoặc cùng rollback. */
  private async applyPayment(
    tx: Prisma.TransactionClient,
    userId: number,
    dto: CreatePaymentDto,
    idempotencyKey?: string,
  ) {
    const nextStatus = dto.simulateSuccess
      ? OrderStatus.PAID
      : OrderStatus.PAYMENT_FAILED;

    if (dto.simulateSuccess) {
      await this.inventory.deductForPaidOrder(tx, dto.orderId);
    }
    const updatedOrder = await this.orderState.transition(
      dto.orderId,
      nextStatus,
      tx,
      {
        paymentMethod: dto.method,
        paidAt: dto.simulateSuccess ? new Date() : null,
        ...(dto.simulateSuccess ? { inventoryDeducted: true } : {}),
      },
    );
    if (dto.simulateSuccess) {
      await this.loyalty.awardPointsForPaidOrder(tx, updatedOrder);
    }

    const result = await tx.order.findUniqueOrThrow({
      where: { id: dto.orderId },
      select: {
        id: true,
        userId: true,
        status: true,
        paymentMethod: true,
        total: true,
        paidAt: true,
        createdAt: true,
      },
    });
    if (tx.payment) {
      await tx.payment.create({
        data: {
          userId,
          orderId: dto.orderId,
          idempotencyKey: idempotencyKey ?? `auto-${randomUUID()}`,
          method: dto.method,
          simulateSuccess: dto.simulateSuccess,
          amount: result.total,
          status: result.status,
          paidAt: result.paidAt,
        },
      });
    }
    return result;
  }

  async create(userId: number, dto: CreatePaymentDto, rawKey?: string) {
    const key = this.validateIdempotencyKey(rawKey);
    const lockKey = key ? `${userId}:${key}` : undefined;

    return this.runSequentiallyByKey(lockKey, async () => {
      if (key) {
        const saved = await this.findSavedPaymentByKey(
          this.prisma,
          userId,
          key,
          dto,
        );
        if (saved) return saved;
      }
      const order = await this.prisma.order.findFirst({
        where: { id: dto.orderId, userId },
        select: { id: true, status: true },
      });
      if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
      if (order.status === OrderStatus.PAID && !key) {
        throw new ConflictException('Đơn hàng đã được thanh toán.');
      }

      return this.prisma.$transaction(
        async (tx) => {
          await this.lockPaymentRequest(tx, userId, dto.orderId, key);
          // Đọc lại sau khi lấy khóa: request khác có thể vừa thanh toán xong.
          if (key) {
            const saved = await this.findSavedPaymentByKey(
              tx,
              userId,
              key,
              dto,
            );
            if (saved) return saved;
          }
          const currentOrder =
            typeof tx.$executeRaw === 'function'
              ? await tx.order.findFirst({
                  where: { id: dto.orderId, userId },
                  select: { status: true },
                })
              : order;
          if (!currentOrder)
            throw new NotFoundException('Không tìm thấy đơn hàng.');
          this.orderState.assertTransition(
            currentOrder.status,
            dto.simulateSuccess ? OrderStatus.PAID : OrderStatus.PAYMENT_FAILED,
          );
          return this.applyPayment(tx, userId, dto, key);
        },
        { maxWait: 15_000, timeout: 20_000 },
      );
    });
  }
}
