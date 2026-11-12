import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { PaymentsModule } from '../src/payments/payments.module.js';

describe('Manual refund endpoint', () => {
  it('does not register a staff refund retry controller', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      PaymentsModule,
    ) as unknown[] | undefined;

    expect(
      controllers?.some(
        (controller) =>
          typeof controller === 'function' &&
          controller.name === 'VnpayRefundController',
      ),
    ).toBe(false);
  });
});
