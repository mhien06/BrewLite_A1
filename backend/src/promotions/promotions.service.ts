import { BadRequestException, Injectable } from '@nestjs/common';
import { PromotionType, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  async validateAndCalculate(
    rawCode: string,
    subtotal: number,
    tx: Prisma.TransactionClient = this.prisma,
    now = new Date(),
  ) {
    const code = rawCode.trim().replace(/\s+/g, '').toUpperCase();
    const promotion = await tx.promotion.findUnique({ where: { code } });

    if (!promotion) {
      throw new BadRequestException('Mã khuyến mãi không tồn tại.');
    }
    if (!promotion.isActive) {
      throw new BadRequestException('Mã khuyến mãi hiện không hoạt động.');
    }
    if (promotion.startsAt && promotion.startsAt > now) {
      throw new BadRequestException('Mã khuyến mãi chưa bắt đầu.');
    }
    if (promotion.expiresAt && promotion.expiresAt <= now) {
      throw new BadRequestException('Mã khuyến mãi đã hết hạn.');
    }
    if (subtotal < promotion.minOrderTotal) {
      throw new BadRequestException(
        `Đơn hàng chưa đạt giá trị tối thiểu ${promotion.minOrderTotal}đ để dùng mã.`,
      );
    }

    const rawDiscount =
      promotion.type === PromotionType.PERCENT
        ? Math.floor((subtotal * promotion.value) / 100)
        : promotion.value;
    const cappedDiscount =
      promotion.type === PromotionType.PERCENT && promotion.maxDiscount !== null
        ? Math.min(rawDiscount, promotion.maxDiscount)
        : rawDiscount;

    return {
      code,
      discountAmount: Math.min(cappedDiscount, subtotal),
    };
  }
}
