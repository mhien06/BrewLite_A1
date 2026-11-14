# A1: đối soát VNPay khi mất IPN

Nhánh: `fix/vnpay-missing-ipn-reconciliation`, từ `main` của `mhien06/BrewLite_A1` tại `00db16a`.

## Cách hoạt động

- `PaymentMaintenanceService` chạy khi khởi động và mỗi 30 giây; một tiến trình không chạy chồng vòng maintenance.
- Sau expiry và hàng đợi refund hiện có, job mới lấy tối đa 20 Payment VNPay `PENDING` đã hết hạn hoặc được tạo ít nhất 5 phút trước. Không phụ thuộc trạng thái Order, nên tìm được cả đơn đã `CANCELLED`.
- Mỗi Payment có tối đa 12 lần QueryDR tự động. Khoảng chờ tăng 5, 10, 20, 40 phút rồi tối đa 60 phút, phù hợp cửa sổ giới hạn truy vấn 5 phút của VNPay (mã 94). Bộ đếm được ghi trước khi gọi mạng, kể cả lần lỗi/worker chết cũng tính vào giới hạn.
- Cập nhật có điều kiện theo bộ đếm/lịch/token giành quyền xử lý giữa các worker. Token ngăn kết quả worker cũ ghi đè metadata của lượt mới; lịch thử lại cho phép phục hồi sau khi worker chết. Không giữ khóa database trong lúc gọi VNPay.
- Dùng nguyên `VnpayTransactionApiService.queryTransaction()`. Chữ ký, command, merchant, txnRef và số tiền được kiểm tra tại client; `handleQueryResult()` xác minh lại chữ ký/binding, chỉ cho giao dịch gốc type `01`, ResponseCode `00`, TransactionStatus `00` đi vào `processCallback()` hiện có của IPN.
- `processCallback()` khóa Order trước Payment, đọc lại dữ liệu và kiểm tra số tiền trong transaction. Kho, điểm, Payment và Refund cùng commit/rollback. IPN và QueryDR dùng cùng logic cho đơn hợp lệ, hết hạn, thiếu kho, đã hủy hoặc thanh toán trùng.
- Đơn hủy nhận tiền: Payment `PAID`, Order giữ `CANCELLED`, đúng một Refund `PENDING` nhờ upsert và unique `paymentId`. Job đối soát không gửi Refund. Worker hoàn tiền hiện có có thể xử lý Refund ở vòng maintenance sau.
- Timeout, lỗi mạng/chữ ký, sai merchant/ref/amount, trạng thái lạ/chưa hoàn tất hoặc kết quả giao dịch refund đều không xác nhận thanh toán. Giữ `PENDING` với metadata `ERROR`/`UNRESOLVED`. Hết 12 lần cần kiểm tra thủ công; IPN hợp lệ vẫn được nhận bình thường.
- Không thay đổi logic refund hiện có: kết quả chưa rõ chỉ QueryDR tiếp, không tự gửi lại Refund khi QueryDR chỉ xác nhận thanh toán gốc.

## Migration

`20261113000000_payment_reconciliation` bổ sung bốn cột trên Payment: số lần, lịch thử lại, token nhận việc và kết quả kỹ thuật; thêm index và ràng buộc số lần không âm. Không xóa bảng/cột, không đổi trạng thái Order/Payment/Refund. Payment cũ mặc định 0 lần, đủ điều kiện sẽ được kiểm tra theo tuổi/hạn giao dịch. Cần apply migration trước khi chạy backend mới. DDL có thể khóa bảng ngắn trong lúc áp dụng; chưa áp dụng lên database A1 thực tế hoặc Render.

## Kiểm thử tự động

Chạy từ `backend` với Node 24 và PostgreSQL kiểm thử riêng. Không dùng database A1 đang vận hành.

```powershell
npm ci
npm run lint
npm test
npm run build
$env:TEST_DATABASE_URL = 'postgresql://<test-user>:<test-password>@127.0.0.1:<test-port>/<database>_test'
$env:DATABASE_URL = $env:TEST_DATABASE_URL
npx prisma migrate deploy
npm run test:database
npm run test:e2e
```

E2E `/products` yêu cầu database có ít nhất một Product fixture. Database suite tự tạo/dọn fixture của từng test. Bộ test mới dùng PostgreSQL thật, dịch vụ kho/điểm thật và mock `fetch` của VNPay; không gọi QueryDR/Refund bên ngoài. Kiểm tra hai Prisma client cạnh tranh, IPN trễ/đồng thời, một Refund, kho/điểm một lần, hết hạn, thiếu kho, dữ liệu giả mạo, kết quả mơ hồ, backoff, hết budget và worker chết. Bộ test refund hiện có kiểm tra không gửi lại sau timeout/kết quả không rõ.

## Hiển kiểm thử trên database A1 local

1. Dừng backend/worker local đang dùng database đó để worker refund không tự gửi yêu cầu khi thấy Refund mới. Giữ nguyên IPN trên Render, merchant, `.env`, URL và cấu hình Render.
2. Trong PowerShell riêng, tại thư mục `backend` của bản clone này, nạp các biến môi trường A1 local hiện có (hoặc dùng cơ chế nạp env sẵn có của bạn). Không dùng URL database Render. Script chỉ chấp nhận host `localhost`, `127.0.0.1`, `::1`. Không đưa secret vào lệnh lưu trong tài liệu/commit.
3. Sao lưu database local theo quy trình hiện có; chạy `npx prisma migrate deploy`, rồi `npx prisma generate`. Không dùng `migrate reset`/`db push`.
4. Đọc trạng thái Payment #3 trước, xác nhận nó thuộc Order #4:

```powershell
npx tsx scripts/reconcile-vnpay-payment.ts 3
```

Lệnh trên chỉ đọc DB, không gọi VNPay. Khi muốn thực sự gọi QueryDR Sandbox cho Payment đó:

```powershell
npx tsx scripts/reconcile-vnpay-payment.ts 3 --execute-query
```

Lệnh có cờ sẽ gọi QueryDR thật và cập nhật database local theo phản hồi đã xác minh. Nó chỉ dựng dịch vụ đối soát cho Payment được chỉ định; không khởi động Nest, timer hoặc worker Refund. Không bỏ qua backoff/giới hạn số lần. Nếu `PAID` rồi thì không QueryDR lần nữa.

Kỳ vọng với ca #4/#3: Order vẫn `CANCELLED`, Payment thành `PAID`, một Refund `PENDING`, kho/điểm không đổi. Nếu VNPay không còn trả kết quả thành công có thể xác minh, giữ Payment `PENDING`; xem `reconciliationResult`, `reconciliationAttempts`, `reconciliationNextAt`. Không suy diễn đã nhận/hoàn tiền từ kết quả lỗi và không sửa tay trạng thái thành công.

Không khởi động lại worker refund trên database này cho tới khi bạn chủ động muốn tiếp tục luồng hoàn tiền hiện có. Không có thao tác deploy, merge, đổi IPN hoặc gọi Refund trong lệnh trên.

## Báo cáo xác minh 13/11/2026

| Kiểm tra | Kết quả |
| --- | --- |
| `npm run lint` | Đạt |
| `npm test` | 173/173, 25 file |
| `npm run test:database` | 71/71, 6 file; PostgreSQL 16 riêng |
| `npm run test:e2e` | 104/104, 9 file, có Product fixture |
| `npx tsc --noEmit --incremental false` | Đạt, bao gồm test và script |
| `npm run build` | Đạt |
| Migration trên DB kiểm thử mới | 17 migration áp dụng thành công |
| Script kiểm tra local mặc định | Đọc fixture thành công, không gọi VNPay |

Lượt E2E đầu có 2 lỗi do database kiểm thử trống không có Product. Đã thêm fixture vào database kiểm thử, chạy lại toàn suite đạt; không sửa test để bỏ qua lỗi. Typecheck bổ sung phát hiện kiểu union của bảng test không phù hợp helper; đã sửa kiểu tham số helper và chạy lại đạt.

Các file thay đổi:

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20261113000000_payment_reconciliation/migration.sql`
- `backend/src/payments/payments.module.ts`
- `backend/src/payments/payment-maintenance.service.ts`
- `backend/src/payments/payment-maintenance.service.spec.ts`
- `backend/src/payments/vnpay/vnpay-ipn.service.ts`
- `backend/src/payments/vnpay/vnpay-ipn.service.spec.ts`
- `backend/src/payments/vnpay/vnpay-reconciliation.service.ts`
- `backend/src/payments/vnpay/vnpay-reconciliation.service.spec.ts`
- `backend/test/vnpay-query-fixture.ts`
- `backend/test/vnpay-reconciliation.database-test.ts`
- `backend/scripts/reconcile-vnpay-payment.ts`
- `docs/vnpay-missing-ipn-reconciliation.md`

Chưa gọi VNPay thật, chưa kiểm chứng/sửa trực tiếp Order #4 / Payment #3 trên database A1 của Hiển. Chưa áp dụng migration ở môi trường đó. Chỉ kiểm thử backend vì thay đổi nằm ở backend; frontend/A2 không thay đổi. Không push, merge hoặc deploy.

## Chẩn đoán QueryDR không xác minh được chữ ký

Log bổ sung chỉ ghi `signature=MISSING/MALFORMED/MISMATCH` và `unverifiedResponseCode` (hai chữ số hoặc UNKNOWN). Mã phản hồi chưa được xác minh chỉ dùng chẩn đoán, không thay đổi quyết định thanh toán. Không log hash, secret, merchant hoặc payload. Không bỏ qua xác minh chữ ký.

Đã đối chiếu thứ tự trường checksum với tài liệu chính thức: https://sandbox.vnpayment.vn/apis/docs/truy-van-hoan-tien/querydr%26refund.html ; giới hạn truy vấn: https://sandbox.vnpayment.vn/apis/docs/bang-ma-loi/ . Chưa xác định nguyên nhân phản hồi lỗi thực tế nếu chưa có metadata mới.
