import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaymentMaintenanceService } from './payment-maintenance.service.js';
import { OrderExpiryService } from './order-expiry.service.js';

describe('Payment maintenance lifecycle', () => {
  afterEach(() => vi.useRealTimers());
  it('checks immediately on startup, repeats, and stops when application closes', async () => {
    vi.useFakeTimers();
    const expiry = { expireDueOrders: vi.fn().mockResolvedValue(undefined) };
    const service = new PaymentMaintenanceService(
      expiry as unknown as OrderExpiryService,
    );
    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    expect(expiry.expireDueOrders).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(expiry.expireDueOrders).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(expiry.expireDueOrders).toHaveBeenCalledTimes(2);
  });
  it('does not overlap a running maintenance cycle', async () => {
    let finish!: () => void;
    const expiry = {
      expireDueOrders: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      ),
    };
    const service = new PaymentMaintenanceService(
      expiry as unknown as OrderExpiryService,
    );
    const pending = service.run();
    await service.run();
    expect(expiry.expireDueOrders).toHaveBeenCalledTimes(1);
    finish();
    await pending;
    expect(expiry.expireDueOrders).toHaveBeenCalledTimes(1);
  });
});
