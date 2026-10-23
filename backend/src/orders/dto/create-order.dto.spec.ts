import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateOrderDto } from './create-order.dto.js';

describe('CreateOrderDto validation', () => {
  const validRequest = {
    items: [
      {
        productId: 1,
        size: 'M',
        quantity: 2,
        toppings: ['pearls'],
      },
    ],
  };

  it('accepts a valid cart payload', async () => {
    const dto = plainToInstance(CreateOrderDto, validRequest);

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects an empty cart', async () => {
    const dto = plainToInstance(CreateOrderDto, { items: [] });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });

  it('rejects a non-positive quantity', async () => {
    const dto = plainToInstance(CreateOrderDto, {
      items: [{ ...validRequest.items[0], quantity: 0 }],
    });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });

  it('rejects an unsupported size or topping', async () => {
    const dto = plainToInstance(CreateOrderDto, {
      items: [{ ...validRequest.items[0], size: 'XL', toppings: ['syrup'] }],
    });

    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});
