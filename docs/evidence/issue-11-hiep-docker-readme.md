# Issue #11 — Hiệp: Docker và README

- Người kiểm tra: Hiệp (báo cáo do Codex hỗ trợ)
- Commit trên main: `005d1ef`
- Ngày kiểm tra: 02/11/2026
- Phần kiểm tra: Docker Compose, cấu hình URL browser/server, seed, xác thực cơ bản, dữ liệu sau restart và hướng dẫn README.
- Kết quả: Đạt trong phạm vi Docker/README bên dưới.
- Lỗi còn lại: Chưa kiểm tra viewport mobile hoặc hiệu năng; luồng thanh toán thất bại rồi thử lại chưa được chụp trong bộ minh chứng này.

## Minh chứng kiểm tra

- `docker compose ... config --quiet`: đạt.
- `docker compose ... up --build -d`: build thành công frontend/backend; PostgreSQL và API healthy; web chạy.
- `docker compose ... ps`: cả ba service đang chạy; PostgreSQL/API healthy.
- `GET /`, `/login`, `/checkout`, `/order-confirmation`, `/orders` trên web và `GET /products` trên API: HTTP 200.
- Kiểm tra giao diện desktop bằng trình duyệt: menu hiện 4 món; trang xác nhận hiển thị đơn `#1`, `PAID`, tổng `49.000đ`; lịch sử hiển thị cùng mã đơn, trạng thái và tổng tiền.
- Menu SSR hiển thị món seed; JavaScript bundle dùng URL API public `http://localhost:18081`, không làm lộ hostname container `http://api:3001`.
- `POST /auth/login` với tài khoản demo: HTTP 200; `GET /auth/me` và `GET /orders/me` có JWT: HTTP 200; `GET /orders/me` không JWT: HTTP 401.
- CSS production: HTTP 200, 49,789 bytes.
- Chạy `npm run prisma:seed` hai lần: thành công cả hai lần; số bản ghi Product/User/Promotion là `4/1/2`.
- Restart Compose: cả ba service chạy lại; số bản ghi Product/User/Promotion vẫn `4/1/2`.
- Backend: lint đạt; unit 82/82 đạt.
- Frontend: lint đạt; unit 30/30 đạt.
- Docker build chạy `npm run build` cho backend và `next build --webpack` cho frontend: đạt.
- Rebuild Compose sau khi cập nhật source lên `005d1ef`: đạt; API/PostgreSQL healthy.
- Dùng Compose project `brewlite-issue11-hiep`, volume PostgreSQL riêng `brewlite-issue11-hiep_postgres_data`, và cổng 18080/18081/55433; không dùng hoặc xóa volume dữ liệu đang làm việc.

## Giới hạn xác nhận

Ảnh giao diện xác nhận trạng thái desktop của menu, trang xác nhận và lịch sử. Chưa kiểm tra viewport mobile, hiệu năng, toàn bộ tình huống lỗi/thử lại hoặc nghiệm thu của giảng viên.

Ảnh đính kèm trong repository:

- `issue-11-hiep/01-menu.png`
- `issue-11-hiep/02-order-confirmation.png`
- `issue-11-hiep/03-order-history.png`
- `issue-11-hiep/04-docker-compose.png`

## Lệnh xem trạng thái và lấy log

Trong PowerShell:

```powershell
$envFile = Join-Path $env:TEMP 'brewlite-issue11-hiep.env'
docker compose --env-file $envFile -p brewlite-issue11-hiep ps
docker compose --env-file $envFile -p brewlite-issue11-hiep logs --tail 100 api web postgres
```

Không đưa token, mật khẩu, `.env` hoặc dữ liệu cá nhân vào ảnh/log.
