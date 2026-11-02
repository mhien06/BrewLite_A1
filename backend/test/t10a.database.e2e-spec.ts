import { ConflictException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, OrderStatus } from '../src/generated/prisma/client.js';
import { LoyaltyService } from '../src/loyalty/loyalty.service.js';
import { OrderStateService } from '../src/orders/order-state.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!testDatabaseUrl)('T10A PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let userId: number;
  let orderId: number;

  const orderState = new OrderStateService({} as PrismaService);
  const loyalty = new LoyaltyService();

  beforeAll(async () => {
    if (!testDatabaseUrl) {
      return;
    }

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: testDatabaseUrl }),
    });
    const user = await prisma.user.create({
      data: {
        email: `t10a-integration-${crypto.randomUUID()}@example.test`,
        passwordHash: 'integration-test',
      },
    });
    userId = user.id;
    const order = await prisma.order.create({
      data: {
        userId,
        subtotal: 58_000,
        total: 58_000,
      },
    });
    orderId = order.id;
  });

  it('awards once after PAID and rejects invalid transitions without changing persisted state', async () => {
    await prisma.$transaction(async (tx) => {
      const paidOrder = await orderState.transition(orderId, OrderStatus.PAID, tx);
      await loyalty.awardPointsForPaidOrder(tx, paidOrder);
    });

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    await prisma.$transaction((tx) =>
      loyalty.awardPointsForPaidOrder(tx, order),
    );

    await expect(
      orderState.transition(orderId, OrderStatus.COMPLETED, prisma),
    ).rejects.toBeInstanceOf(ConflictException);

    const [persistedOrder, persistedUser, transactions] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: orderId } }),
      prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      prisma.loyaltyTransaction.findMany({ where: { orderId } }),
    ]);

    expect(persistedOrder.status).toBe(OrderStatus.PAID);
    expect(persistedUser.loyaltyPoints).toBe(5);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.points).toBe(5);
  });

  afterAll(async () => {
    if (!testDatabaseUrl || !prisma) {
      return;
    }

    if (orderId) {
      await prisma.loyaltyTransaction.deleteMany({ where: { orderId } });
      await prisma.order.delete({ where: { id: orderId } });
    }
    if (userId) {
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });
});
