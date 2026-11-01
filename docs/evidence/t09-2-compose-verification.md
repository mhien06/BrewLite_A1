# Minh chứng chạy Docker Compose T09.2

Ngày kiểm tra ban đầu: 31/10/2026
Nhánh: `task-9/docker-handover`
Compose project: `brewlite-t09-demo` (volume cô lập `brewlite-t09-demo_postgres_data`)

## Môi trường

- Docker Desktop `29.9.2`; Docker Compose `v5.6.1`.
- Windows 11 Home, WSL 2.
- JWT secret được truyền tạm vào tiến trình Compose; không ghi ra `.env`, Dockerfile, image hoặc Git.

## Kết quả khởi động

`docker compose -p brewlite-t09-demo up --build -d` build thành công hai image và khởi động đủ ba dịch vụ. `docker compose ps` báo PostgreSQL và API `healthy`; web `Up`. Các cổng local là `5432`, `3001`, `3000` tương ứng.

PostgreSQL đạt health check trước API. API tự chạy migration trước khi NestJS khởi động; API health check đạt trước khi web bắt đầu.

## Kiểm tra API, Menu và seed

- `GET http://localhost:3001/products`: HTTP `200`, trả 4 món sau seed.
- `GET http://localhost:3000`: HTTP `200`; trang Menu render được trong web container với URL API server-side `http://api:3001`.
- Chạy `npm run prisma:seed` lần hai: thành công; số món vẫn là 4 và đơn thử vẫn còn.

## Kiểm tra đăng nhập, đơn và thanh toán

Đăng nhập tài khoản demo do seed tạo, gọi `POST /orders` với món có thật rồi gọi `POST /payments`. JWT và thông tin đăng nhập được lược bỏ khỏi minh chứng.

- Tạo đơn: ID `1`, trạng thái ban đầu `PENDING`.
- Thanh toán mô phỏng: trạng thái response `PAID`, tổng tiền `29.000 VND`.
- Sau thanh toán: database có 4 Product và 1 Order đã `PAID`.

## Kiểm tra giữ dữ liệu sau restart

Chạy `docker compose -p brewlite-t09-demo down` (không dùng `-v`), sau đó `docker compose -p brewlite-t09-demo up -d`.

- PostgreSQL và API trở lại `healthy`; web chạy.
- Database còn 4 Product và 1 Order.
- Không xóa volume; đây là project kiểm thử riêng, không dùng volume mặc định của Compose.

## Kiểm thử hồi quy thanh toán T09 (01/11/2026)

Sau khi sửa checkout để điều hướng theo `orderId` của response `PAID`, build lại với:

```powershell
docker compose -p brewlite-t09-demo up --build -d
```

PostgreSQL và API báo `healthy`; web chạy. Kiểm thử giao diện bằng Chrome headless trên Compose, kết hợp xác minh `POST /orders`, `POST /payments`, `GET /orders/:id` và `GET /orders/me`. Dùng tài khoản test mới; không ghi email, mật khẩu, JWT hoặc secret vào minh chứng.

### Test A — Thanh toán thành công lần đầu

- Giao diện nhận thanh toán `PAID`, chuyển đến `/order-confirmation?orderId=9` và hiển thị thành công, mã đơn `#9`.
- Backend detail và history cùng trả `PAID`, tổng `34.000 VND`; history có đúng một bản ghi của đơn `9`.
- Reload URL xác nhận vẫn tải đúng đơn từ backend. Giỏ rỗng khi truy cập `/cart` sau thanh toán.

### Test B — Thất bại rồi thử lại

- Lần đầu hiển thị `PAYMENT_FAILED`; giỏ hàng vẫn còn.
- Retry đi qua Checkout hiện có và dùng lại `orderId=10`.
- Response cuối là `PAID`; URL xác nhận là `/order-confirmation?orderId=10`; history có đúng một bản ghi của đơn `10`.

### Test C — Xác nhận và lịch sử

- `/orders` hiển thị các đơn `9` và `10` với trạng thái “Đã thanh toán”, tổng `34.000 VND` và link chi tiết.
- Mở chi tiết đơn `9`: UI, `GET /orders/9` và bản ghi tương ứng trong `GET /orders/me` cùng khớp ID `9`, trạng thái `PAID`, tổng `34.000 VND`.
- Các route `/orders` và `/order-confirmation?orderId=9|10` trả HTTP `200`.

### Kiểm tra tự động liên quan

- Frontend: `npm run lint` đạt; `npm test` đạt `24/24`.
- Backend: `npm run lint` đạt; `npm test` đạt `29/29`.
- Docker Compose build thành công cả frontend và backend.

Các tài khoản và đơn thử vẫn nằm trong volume kiểm thử cô lập; không chạy `down -v` và không xóa volume.

## Tailwind production styling regression (01/11/2026)

Thêm cấu hình PostCSS Tailwind v4 để `next build --webpack` trong Docker xử lý utility CSS ở production.

Kiểm tra bằng Compose project cô lập `brewlite-t09-css`, không sử dụng/xóa volume mặc định hoặc volume đang làm việc:

- `docker compose -p brewlite-t09-css up --build -d` build thành công frontend Webpack và backend. PostgreSQL và API healthy; web khởi động.
- Menu `/`, đăng nhập `/login`, checkout `/checkout`, xác nhận `/order-confirmation?orderId=1` và lịch sử `/orders` đều trả HTTP `200`; stylesheet production tải HTTP `200`.
- CSS được phục vụ từ container có utility selectors `flex`, `grid`, `items-center`, `rounded-xl`, `h-6` và `w-6`, gồm các utility kích thước cho SVG icon.
- Seed trên database kiểm thử tạo 4 sản phẩm; login demo, `GET /auth/me` và `GET /orders/me` đều trả thành công.
- Frontend `npm run build`, `npm run lint` đạt; `npm test` đạt `24/24`.

Kiểm tra này xác nhận production build trong Docker phát sinh và phục vụ Tailwind CSS. Không lưu ảnh chụp màn hình mới; browser UI capture bị timeout trong môi trường kiểm thử.

## Giới hạn minh chứng

Kết quả kiểm tra được ghi từ giao diện Chrome headless, container, API và PostgreSQL thật. Không đính kèm ảnh chụp màn hình; ID, trạng thái, tổng tiền, URL và đối chiếu backend được ghi ở trên.
