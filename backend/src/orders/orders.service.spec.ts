import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrdersService } from './orders.service.js';

describe('OrdersService', () => {
  const product = {
    id: 1,
    name: 'Cà phê sữa',
    price: 29_000,
    imageUrl: '/coffee.jpg',
    stock: 5,
  };
  const orderCreate = vi.fn();
  const productFindMany = vi.fn();
  const prisma = {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({
        product: { findMany: productFindMany },
        order: { create: orderCreate },
      }),
    ),
  } as unknown as PrismaService;
  const service = new OrdersService(prisma);

  beforeEach(() => {
    vi.clearAllMocks();
    productFindMany.mockResolvedValue([product]);
    orderCreate.mockImplementation(async ({ data, select }) => ({
      id: 21,
      status: data.status,
      total: data.total,
      createdAt: new Date('2026-10-23T00:00:00.000Z'),
      items: data.items.create,
      select,
    }));
  });

  it('calculates prices on the server and saves a pending order', async () => {
    const dto: CreateOrderDto = {
      items: [
        {
          productId: 1,
          size: 'M',
          quantity: 2,
          toppings: ['pearls'],
        },
      ],
    };

    const order = await service.create(dto);

    expect(order).toMatchObject({ id: 21, status: OrderStatus.PENDING, total: 84_000 });
    expect(orderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OrderStatus.PENDING,
          total: 84_000,
          items: {
            create: [
              {
                productId: 1,
                size: 'M',
                toppings: ['pearls'],
                quantity: 2,
                unitPrice: 42_000,
                lineTotal: 84_000,
              },
            ],
          },
        }),
      }),
    );
  });

  it('rejects a product that does not exist', async () => {
    productFindMany.mockResolvedValue([]);

    await expect(
      service.create({
        items: [{ productId: 99, size: 'S', quantity: 1, toppings: [] }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it('rejects a quantity greater than available stock', async () => {
    await expect(
      service.create({
        items: [{ productId: 1, size: 'S', quantity: 6, toppings: [] }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(orderCreate).not.toHaveBeenCalled();
  });
});
