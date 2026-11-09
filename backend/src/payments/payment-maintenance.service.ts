import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { OrderExpiryService } from './order-expiry.service.js';

@Injectable()
export class PaymentMaintenanceService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(PaymentMaintenanceService.name);
  constructor(private readonly expiry: OrderExpiryService) {}
  onApplicationBootstrap() {
    // Đọc lại database ngay khi khởi động, kể cả đơn hết hạn lúc server tắt.
    void this.run();
    this.timer = setInterval(() => void this.run(), 30_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      await this.expiry.expireDueOrders();
    } catch {
      this.logger.error(
        'Chưa xử lý được đơn quá hạn; sẽ thử lại ở lượt tiếp theo.',
      );
    } finally {
      this.running = false;
    }
  }
}
