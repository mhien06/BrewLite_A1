import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaymentMaintenanceService } from './payment-maintenance.service.js';
import { OrderExpiryService } from './order-expiry.service.js';
import { VnpayRefundService } from './vnpay/vnpay-refund.service.js';
import { VnpayReconciliationService } from './vnpay/vnpay-reconciliation.service.js';

describe('Payment maintenance lifecycle', () => {
  afterEach(() => vi.useRealTimers());

  it('checks expiry and refund queue immediately, repeats, and stops on shutdown', async () => {
    vi.useFakeTimers();
    const expiry = { expireDueOrders: vi.fn().mockResolvedValue(undefined) };
    const refunds = { processRefunds: vi.fn().mockResolvedValue(undefined) };
    const reconciliation = { reconcilePendingPayments: vi.fn().mockResolvedValue(undefined) };
    const service = new PaymentMaintenanceService(
      expiry as unknown as OrderExpiryService,
      refunds as unknown as VnpayRefundService,
      reconciliation as unknown as VnpayReconciliationService,
    );
    service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(0);
    expect(expiry.expireDueOrders).toHaveBeenCalledTimes(1);
    expect(refunds.processRefunds).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(expiry.expireDueOrders).toHaveBeenCalledTimes(2);
    expect(refunds.processRefunds).toHaveBeenCalledTimes(2);
    expect(reconciliation.reconcilePendingPayments).toHaveBeenCalledTimes(2);
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
      { reconcilePendingPayments: vi.fn() } as unknown as VnpayReconciliationService,
    );
    const pending = service.run();
    await service.run();
    expect(refunds.processRefunds).toHaveBeenCalledTimes(1);
    finish();
    await pending;
    expect(refunds.processRefunds).toHaveBeenCalledTimes(1);
  });

  it('still reconciles missing IPNs if expiry or the refund queue fails', async () => {
    const reconciliation = { reconcilePendingPayments: vi.fn().mockResolvedValue(undefined) };
    const service = new PaymentMaintenanceService(
      { expireDueOrders: vi.fn().mockRejectedValue(new Error('database')) } as unknown as OrderExpiryService,
      { processRefunds: vi.fn().mockRejectedValue(new Error('refund queue')) } as unknown as VnpayRefundService,
      reconciliation as unknown as VnpayReconciliationService,
    );
    await service.run();
    expect(reconciliation.reconcilePendingPayments).toHaveBeenCalledTimes(1);
  });
});
