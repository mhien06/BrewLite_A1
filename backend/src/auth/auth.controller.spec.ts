import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('AuthController', () => {
  let controller: AuthController;
  let service: {
    register: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    getMe: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      register: vi.fn(),
      login: vi.fn(),
      getMe: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: service }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('gọi service.register khi POST /auth/register', async () => {
    const dto = { name: 'TEST USER', email: 'test@gmail.com', password: 'password123' };
    service.register.mockResolvedValue({
      message: 'Đăng ký thành công. Vui lòng đăng nhập.',
      user: { id: 1, email: dto.email, name: dto.name, loyaltyPoints: 0 },
    });

    const res = await controller.register(dto);
    expect(service.register).toHaveBeenCalledWith(dto);
    expect(res.user.name).toBe(dto.name);
    expect(res).not.toHaveProperty('accessToken');
  });

  it('gọi service.login khi POST /auth/login', async () => {
    const dto = { email: 'test@brewlite.vn', password: 'password123' };
    service.login.mockResolvedValue({
      accessToken: 'token',
      user: { id: 1, email: dto.email, loyaltyPoints: 0 },
    });

    const res = await controller.login(dto);
    expect(service.login).toHaveBeenCalledWith(dto);
    expect(res.accessToken).toBe('token');
  });

  it('gọi service.getMe khi GET /auth/me', async () => {
    service.getMe.mockResolvedValue({ id: 1, email: 'test@brewlite.vn' });
    const res = await controller.getMe({ id: 1, email: 'test@brewlite.vn' });
    expect(service.getMe).toHaveBeenCalledWith(1);
    expect(res.id).toBe(1);
  });
});
