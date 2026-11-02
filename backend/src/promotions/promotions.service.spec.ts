import { BadRequestException } from '@nestjs/common';
import { PromotionType, type Prisma } from '../generated/prisma/client.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromotionsService } from './promotions.service.js';

describe('PromotionsService', () => {
  const findUnique = vi.fn();
  const tx = { promotion: { findUnique } } as unknown as Prisma.TransactionClient;
  const service = new PromotionsService({} as never);
  const now = new Date('2026-10-30T00:00:00.000Z');

  const promotion = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    code: 'BREW10',
    type: PromotionType.PERCENT,
    value: 10,
    minOrderTotal: 0,
    maxDiscount: null,
    startsAt: null,
    expiresAt: null,
    isActive: true,
    createdAt: now,
    ...overrides,
  });

  beforeEach(() => vi.clearAllMocks());

  it('normalizes whitespace and case before looking up a code', async () => {
    findUnique.mockResolvedValue(promotion());

    await expect(
      service.validateAndCalculate(' bReW 10 ', 50_000, tx, now),
    ).resolves.toEqual({ code: 'BREW10', discountAmount: 5_000 });
    expect(findUnique).toHaveBeenCalledWith({ where: { code: 'BREW10' } });
  });

  it('rejects a code that does not exist', async () => {
    findUnique.mockResolvedValue(null);

    await expect(
      service.validateAndCalculate('MISSING', 50_000, tx, now),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects inactive, not-yet-started, expired, and below-minimum codes', async () => {
    findUnique.mockResolvedValue(promotion({ isActive: false }));
    await expect(
      service.validateAndCalculate('BREW10', 50_000, tx, now),
    ).rejects.toThrow('Mã khuyến mãi hiện không hoạt động.');

    findUnique.mockResolvedValue(
      promotion({ startsAt: new Date('2026-10-31T00:00:00.000Z') }),
    );
    await expect(
      service.validateAndCalculate('BREW10', 50_000, tx, now),
    ).rejects.toThrow('Mã khuyến mãi chưa bắt đầu.');

    findUnique.mockResolvedValue(
      promotion({ expiresAt: new Date('2026-10-29T23:59:59.000Z') }),
    );
    await expect(
      service.validateAndCalculate('BREW10', 50_000, tx, now),
    ).rejects.toThrow('Mã khuyến mãi đã hết hạn.');

    findUnique.mockResolvedValue(promotion({ minOrderTotal: 60_000 }));
    await expect(
      service.validateAndCalculate('BREW10', 50_000, tx, now),
    ).rejects.toThrow('Đơn hàng chưa đạt giá trị tối thiểu 60000đ để dùng mã.');
  });

  it('applies percentage discount with floor rounding and max cap', async () => {
    findUnique.mockResolvedValue(
      promotion({ maxDiscount: 2_000, minOrderTotal: 1 }),
    );

    await expect(
      service.validateAndCalculate('BREW10', 29_999, tx, now),
    ).resolves.toEqual({ code: 'BREW10', discountAmount: 2_000 });
  });

  it('applies percentage discount without a cap and rounds down to whole VND', async () => {
    findUnique.mockResolvedValue(
      promotion({ value: 15, maxDiscount: null, minOrderTotal: 1 }),
    );

    await expect(
      service.validateAndCalculate('BREW10', 10_003, tx, now),
    ).resolves.toEqual({ code: 'BREW10', discountAmount: 1_500 });
  });

  it('caps fixed discounts at the subtotal', async () => {
    findUnique.mockResolvedValue(
      promotion({
        type: PromotionType.FIXED_AMOUNT,
        value: 15_000,
        minOrderTotal: 0,
      }),
    );

    await expect(
      service.validateAndCalculate('GIAM15K', 8_000, tx, now),
    ).resolves.toEqual({ code: 'GIAM15K', discountAmount: 8_000 });
  });
});
