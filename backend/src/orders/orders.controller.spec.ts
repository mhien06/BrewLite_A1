import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../auth/decorators/current-user.decorator.js';
import { OrdersController } from './orders.controller.js';
import type { OrdersService } from './orders.service.js';

describe('OrdersController (T09A)', () => {
  const mockService = {
    create: vi.fn(),
    findMyOrders: vi.fn(),
    findOne: vi.fn(),
  };

  const controller = new OrdersController(mockService as unknown as OrdersService);
  const mockUser: AuthUser = { id: 42, email: 'user@example.com' };

  it('delegates findMyOrders to OrdersService with user.id', async () => {
    mockService.findMyOrders.mockResolvedValue([]);

    const result = await controller.findMyOrders(mockUser);

    expect(result).toEqual([]);
    expect(mockService.findMyOrders).toHaveBeenCalledWith(42);
  });

  it('delegates findOne to OrdersService with user.id and orderId', async () => {
    const mockOrder = { id: 10, userId: 42, total: 30000 };
    mockService.findOne.mockResolvedValue(mockOrder);

    const result = await controller.findOne(mockUser, 10);

    expect(result).toEqual(mockOrder);
    expect(mockService.findOne).toHaveBeenCalledWith(42, 10);
  });
});
