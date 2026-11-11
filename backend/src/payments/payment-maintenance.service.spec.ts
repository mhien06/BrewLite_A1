import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaymentMaintenanceService } from './payment-maintenance.service.js';
import { OrderExpiryService } from './order-expiry.service.js';
import { VnpayRefundService } from './vnpay/vnpay-refund.service.js';

describe('Payment maintenance lifecycle', () => {
  afterEach(() => vi.useRealTimers());

  it('checks expiry and refund queue immediately, repeats, and stops on shutdown', async () => {
    vi.useFakeTimers();
    const expiry = { expireDueOrders: vi.fn().mockResolvedValue(undefined) };
    const refunds = { processRefunds: vi.fn().mockResolvedValue(undefined) };
    const service = new PaymentMaintenanceService(
      expiry as unknown as OrderExpiryService,
      refunds as unknown as VnpayRefundService,
    );
    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    expect(expiry.expireDueOrders).toHaveBeenCalledTimes(1);
    expect(refunds.processRefunds).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(expiry.expireDueOrders).toHaveBeenCalledTimes(2);
    expect(refunds.processRefunds).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(expiry.expireDueOrders).toHaveBeenCalledTimes(2);
    expect(refunds.processRefunds).toHaveBeenCalledTimes(2);
  });

  it('does not overlap a running maintenance cycle', async () => {
    let finish!: () => void;
    const expiry = { expireDueOrders: vi.fn().mockResolvedValue(undefined) };
    const refunds = {
      processRefunds: vi.fn(() => new Promise<void>((resolve) => { finish = resolve; })),
    };
    const service = new PaymentMaintenanceService(
      expiry as unknown as OrderExpiryService,
      refunds as unknown as VnpayRefundService,
    );
    const pending = service.run();
    await service.run();
    expect(refunds.processRefunds).toHaveBeenCalledTimes(1);
    finish();
    await pending;
    expect(refunds.processRefunds).toHaveBeenCalledTimes(1);
  });
});