import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';

export const VND_PER_LOYALTY_POINT = 10_000;

@Injectable()
export class LoyaltyService {
  async awardPointsForPaidOrder(
    tx: Prisma.TransactionClient,
    order: Pick<Prisma.OrderGetPayload<object>, 'id' | 'userId' | 'total'>,
  ): Promise<number> {
    const points = Math.floor(order.total / VND_PER_LOYALTY_POINT);
    const result = await tx.loyaltyTransaction.createMany({
      data: [{ userId: order.userId, orderId: order.id, points }],
      skipDuplicates: true,
    });

    if (result.count === 0) {
      return 0;
    }

    await tx.user.update({
      where: { id: order.userId },
      data: { loyaltyPoints: { increment: points } },
    });

    return points;
  }
}
