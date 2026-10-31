# Minh chứng chạy Docker Compose T09.2

Ngày kiểm tra: 31/10/2026  
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

## Giới hạn minh chứng

Kết quả kiểm tra được ghi từ container/API/PostgreSQL thật. Chưa đính kèm ảnh giao diện vì cả Chromium và Edge headless đều không khởi tạo được GPU trong môi trường chụp ảnh; không dùng ảnh giả lập.
