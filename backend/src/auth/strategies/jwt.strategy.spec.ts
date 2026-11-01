import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { JwtStrategy } from './jwt.strategy.js';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: vi.fn(),
      },
    };
    strategy = new JwtStrategy(prisma as unknown as PrismaService);
  });

  it('xác thực payload hợp lệ và trả về thông tin user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 5,
      email: 'user5@brewlite.vn',
      name: 'USER FIVE',
    });

    const result = await strategy.validate({
      sub: 5,
      email: 'user5@brewlite.vn',
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 5 },
      select: { id: true, email: true, name: true, role: true },
    });
    expect(result).toEqual({
      id: 5,
      email: 'user5@brewlite.vn',
      name: 'USER FIVE',
    });
  });

  it('ném lỗi UnauthorizedException khi payload không có sub', async () => {
    await expect(strategy.validate({} as any)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('ném lỗi UnauthorizedException khi user không còn trong database', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 999, email: 'ghost@brewlite.vn' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
