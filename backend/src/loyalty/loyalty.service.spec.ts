import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../generated/prisma/client.js';
import { LoyaltyService } from './loyalty.service.js';

describe('LoyaltyService', () => {
  it('awards floor(total / 10000) points once per order', async () => {
    const createMany = vi
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const update = vi.fn().mockResolvedValue({});
    const service = new LoyaltyService();
    const tx = {
      loyaltyTransaction: { createMany },
      user: { update },
    } as unknown as Prisma.TransactionClient;
    const order = { id: 4, userId: 7, total: 58_999 };

    await expect(service.awardPointsForPaidOrder(tx, order)).resolves.toBe(5);
    await expect(service.awardPointsForPaidOrder(tx, order)).resolves.toBe(0);

    expect(createMany).toHaveBeenCalledWith({
      data: [{ userId: 7, orderId: 4, points: 5 }],
      skipDuplicates: true,
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { loyaltyPoints: { increment: 5 } },
    });
  });

  it('records an order with zero points when its paid total is below 10000 VND', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const update = vi.fn().mockResolvedValue({});
    const service = new LoyaltyService();
    const tx = {
      loyaltyTransaction: { createMany },
      user: { update },
    } as unknown as Prisma.TransactionClient;

    await expect(
      service.awardPointsForPaidOrder(tx, { id: 5, userId: 8, total: 9_999 }),
    ).resolves.toBe(0);

    expect(createMany).toHaveBeenCalledWith({
      data: [{ userId: 8, orderId: 5, points: 0 }],
      skipDuplicates: true,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 8 },
      data: { loyaltyPoints: { increment: 0 } },
    });
  });
});
