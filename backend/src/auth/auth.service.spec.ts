import { ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  };
  let jwtService: {
    sign: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    };

    jwtService = {
      sign: vi.fn().mockReturnValue('mock-jwt-token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('đăng ký thành công, băm mật khẩu và trả thông báo yêu cầu đăng nhập lại', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: 1,
          email: data.email,
          name: data.name,
          passwordHash: data.passwordHash,
          loyaltyPoints: 0,
          createdAt: new Date('2026-10-24T12:00:00Z'),
        }),
      );

      const result = await service.register({
        name: 'NGUYEN VAN A',
        email: 'TEST@gmail.com',
        password: 'password123',
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@gmail.com' },
      });
      expect(prisma.user.create).toHaveBeenCalled();
      const createArg = prisma.user.create.mock.calls[0][0];
      expect(createArg.data.email).toBe('test@gmail.com');
      expect(createArg.data.name).toBe('NGUYEN VAN A');
      expect(createArg.data.passwordHash).not.toBe('password123');
      expect(bcrypt.compareSync('password123', createArg.data.passwordHash)).toBe(true);

      expect(result.user.name).toBe('NGUYEN VAN A');
      expect(result.user.email).toBe('test@gmail.com');
      expect(result.user.loyaltyPoints).toBe(0);
    });

    it('từ chối đăng ký khi email đã tồn tại (throw ConflictException)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        email: 'existing@gmail.com',
      });

      await expect(
        service.register({
          name: 'TRAN VAN B',
          email: 'existing@gmail.com',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('chuyển lỗi unique khi tạo user thành ConflictException', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '7.10.1',
          meta: { target: ['id'] },
        }),
      );

      await expect(
        service.register({
          name: 'TRAN VAN B',
          email: 'new@gmail.com',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('đăng nhập thành công khi đúng email và mật khẩu', async () => {
      const passwordHash = await bcrypt.hash('secretPass', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 2,
        email: 'user@gmail.com',
        name: 'LE THI C',
        passwordHash,
        loyaltyPoints: 50,
      });

      const result = await service.login({
        email: 'user@gmail.com',
        password: 'secretPass',
      });

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user).toEqual({
        id: 2,
        email: 'user@gmail.com',
        name: 'LE THI C',
        loyaltyPoints: 50,
      });
    });

    it('ném lỗi UnauthorizedException khi không tìm thấy email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({
          email: 'notfound@gmail.com',
          password: 'password123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('ném lỗi UnauthorizedException khi mật khẩu sai', async () => {
      const passwordHash = await bcrypt.hash('correctPassword', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 3,
        email: 'user@gmail.com',
        name: 'LE THI C',
        passwordHash,
        loyaltyPoints: 0,
      });

      await expect(
        service.login({
          email: 'user@gmail.com',
          password: 'wrongPassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getMe', () => {
    it('trả thông tin người dùng hiện tại', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 1,
        email: 'me@gmail.com',
        name: 'HOANG MINH',
        loyaltyPoints: 10,
        createdAt: new Date('2026-10-24T12:00:00Z'),
      });

      const user = await service.getMe(1);
      expect(user.id).toBe(1);
      expect(user.email).toBe('me@gmail.com');
      expect(user.name).toBe('HOANG MINH');
    });

    it('ném lỗi NotFoundException khi user không tồn tại', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe(999)).rejects.toThrow(NotFoundException);
    });
  });
});
