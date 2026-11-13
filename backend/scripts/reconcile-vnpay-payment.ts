import 'dotenv/config';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { OrderStateService } from '../src/orders/order-state.service.js';
import { InventoryService } from '../src/inventory/inventory.service.js';
import { LoyaltyService } from '../src/loyalty/loyalty.service.js';
import { VnpayIpnService } from '../src/payments/vnpay/vnpay-ipn.service.js';
import { VnpayTransactionApiService } from '../src/payments/vnpay/vnpay-transaction-api.service.js';
import { VnpayReconciliationService } from '../src/payments/vnpay/vnpay-reconciliation.service.js';

// Deliberately construct only reconciliation dependencies: no Nest bootstrap,
// maintenance timer, expiry scan, or refund worker can run from this command.
async function main() {
  const args = process.argv.slice(2);
  const id = Number(args[0]);
  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    args.slice(1).some((a) => a !== '--execute-query')
  ) {
    throw new Error(
      'Usage: npx tsx scripts/reconcile-vnpay-payment.ts <paymentId> [--execute-query]',
    );
  }
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error(
      'Lệnh kiểm thử này chỉ cho phép database local qua loopback.',
    );
  }
  const db = new PrismaService();
  try {
    const snapshot = () =>
      db.payment.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          orderId: true,
          method: true,
          amount: true,
          status: true,
          reconciliationAttempts: true,
          reconciliationNextAt: true,
          reconciliationResult: true,
          order: { select: { status: true, inventoryDeducted: true } },
          refund: { select: { id: true, status: true, amount: true } },
        },
      });
    console.log('Before:', await snapshot());
    if (!args.includes('--execute-query')) {
      console.log(
        'Chỉ đọc database. Thêm --execute-query để gọi QueryDR và áp dụng kết quả đã xác minh.',
      );
      return;
    }
    const settlement = new VnpayIpnService(
      db,
      new OrderStateService(db),
      new InventoryService(db),
      new LoyaltyService(),
    );
    await new VnpayReconciliationService(
      db,
      new VnpayTransactionApiService(),
      settlement,
    ).reconcilePendingPayments(new Date(), id);
    console.log('After:', await snapshot());
    console.log(
      'Không chạy Refund. Nếu không đổi, kiểm tra tuổi giao dịch, lịch thử lại và giới hạn 12 lần.',
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch(() => {
  console.error(
    'Không hoàn tất kiểm tra. Kiểm tra tham số, kết nối database local, migration và cấu hình VNPay hiện có.',
  );
  process.exitCode = 1;
});
