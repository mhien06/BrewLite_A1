# BrewLite - Agile Scrum

Ứng dụng đặt và thanh toán đồ uống không dùng tiền mặt, bài tập lớn môn Công nghệ Phần mềm, Đại học Sài Gòn.

## Phạm vi T01 - Hiển

Khởi tạo frontend Next.js (TypeScript, Tailwind CSS) và backend NestJS (TypeScript). Frontend hiển thị trang chào; backend có `GET /` trả `Hello World!`.

Các chức năng menu, giỏ hàng, đơn hàng, đăng nhập và thanh toán thuộc những task tiếp theo. PostgreSQL, Prisma, Zustand và Docker Compose sẽ được bổ sung khi đến task tương ứng.

## Phạm vi T02 - Thành

Tích hợp PostgreSQL và Prisma để lưu trữ sản phẩm. Backend cung cấp `GET /products` và `GET /products/:id`; Product gồm `id`, `name`, `price`, `imageUrl`, `stock`, đồng thời xử lý ID không hợp lệ và ID không tồn tại.

## Cấu trúc

```text
frontend/  # Next.js App Router, src/app
backend/   # NestJS, Prisma, src và test
```

Hai ứng dụng có `package.json` và `package-lock.json` riêng; chạy npm trong thư mục tương ứng.

## Yêu cầu

- Node.js 24 LTS và npm 11.
- PostgreSQL 16.
- Truy cập npm registry để cài dependencies lần đầu.
- Từ T02, backend sử dụng PostgreSQL và Prisma.

## Cài đặt

Chạy bằng PowerShell từ thư mục gốc:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local

cd ../backend
npm ci
Copy-Item .env.example .env

cd ..
```

Chỉ sao chép file env ở lần đầu để tránh ghi đè cấu hình đã có.

### Khởi tạo database cho T02

Chỉ tạo database một lần:

```powershell
psql -U postgres -d postgres -c "CREATE DATABASE brewlite_scrum;"
```

Trong `backend/.env`, thay `YOUR_PASSWORD` bằng mật khẩu PostgreSQL:

```env
PORT=3001
FRONTEND_URL=http://localhost:3000
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/brewlite_scrum?schema=public"
```

Áp dụng migration và thêm dữ liệu mẫu:

```powershell
cd backend
npm run prisma:deploy
npm run prisma:seed
cd ..
```

Lệnh seed tạo lại dữ liệu mẫu trong bảng `Product`.

## Chạy phát triển

Terminal 1:

```powershell
cd frontend
npm run dev
```

Mở <http://localhost:3000> để xem frontend BrewLite.

Terminal 2:

```powershell
cd backend
npm run start:dev
```

Backend chạy tại <http://localhost:3001>. Dừng ứng dụng bằng `Ctrl + C`.

## Products API

| Method | Endpoint                             | Kết quả                |
| ------ | ------------------------------------ | ---------------------- |
| GET    | `/products`                          | Trả danh sách sản phẩm |
| GET    | `/products/:id`                      | Trả chi tiết sản phẩm  |
| GET    | `/products/:id` với ID không tồn tại | Trả HTTP 404           |
| GET    | `/products/:id` với ID không hợp lệ  | Trả HTTP 400           |

Ví dụ:

```powershell
$products = Invoke-RestMethod http://localhost:3001/products
$products

Invoke-RestMethod "http://localhost:3001/products/$($products[0].id)"
```

## Biến môi trường

| Ứng dụng | Biến                | Mặc định              | Ý nghĩa                                                |
| -------- | ------------------- | --------------------- | ------------------------------------------------------ |
| frontend | NEXT_PUBLIC_API_URL | http://localhost:3001 | URL API; không chứa bí mật                             |
| backend  | PORT                | 3001                  | Cổng HTTP của backend                                  |
| backend  | FRONTEND_URL        | http://localhost:3000 | Origin được phép gọi API qua CORS                      |
| backend  | DATABASE_URL        | Không có              | Chuỗi kết nối PostgreSQL; chỉ lưu trong `backend/.env` |

Next.js đọc `.env.local`. Backend đọc `.env` trong thư mục `backend`. Các file env thật không được đưa lên Git, chỉ commit `.env.example`.

## Kiểm tra và build

```powershell
cd frontend
npm run lint
npm run build

cd ../backend
npm run lint
npm run build
npm test
npm run test:e2e
````

## Chạy bản production

Sau khi build, chạy trong hai terminal riêng:

```powershell
cd frontend
npm start
```

```powershell
cd backend
npm run start:prod
```

## Quy trình nhóm

Dự án gồm 10 task và 3 Sprint, từ 14/10/2026 đến 04/11/2026.

- T01 sử dụng branch `task-1/init-project`.
- T02 sử dụng branch `task-2/products-api`.

Quy trình:

```text
Issue → Branch → Code → Test → Commit → Push → Pull Request → Review → Merge → Done
```

Không code trực tiếp trên `main`. Merge và đóng Issue theo quyết định của nhóm/người dùng.

Task chỉ được đánh dấu Done sau khi đáp ứng Acceptance Criteria, kiểm tra đạt, được review và merge.

## Kết quả kiểm tra T01 (14/10/2026)

- Frontend lint và production build đạt.
- `GET /` frontend trả HTTP 200 và hiển thị trang chào BrewLite.
- Backend lint, build, unit test và e2e test đạt.
- Backend `GET /` trả HTTP 200 và `Hello World!`.
- CORS cho phép origin `http://localhost:3000`.
- `npm audit --omit=dev` không có cảnh báo ở cả hai ứng dụng tại thời điểm kiểm tra.
- Frontend có cảnh báo trong dependencies phát triển của ESLint; chưa tự động chạy `npm audit fix --force`.

## Kết quả kiểm tra T02 (15/10/2026)

- PostgreSQL và Prisma được cấu hình thành công.
- Migration và seed dữ liệu Product hoạt động.
- `GET /products` trả danh sách sản phẩm với đủ `id`, `name`, `price`, `imageUrl` và `stock`.
- `GET /products/:id` trả đúng chi tiết sản phẩm.
- ID không tồn tại trả HTTP 404.
- ID không hợp lệ trả HTTP 400.
- Backend lint và build đạt.
- E2E test đạt 5/5 trường hợp.

## Tài liệu công nghệ

- Next.js: <https://nextjs.org/docs/app/getting-started/installation>
- NestJS: <https://docs.nestjs.com/first-steps>
- Prisma ORM: <https://www.prisma.io/docs/orm>
- PostgreSQL: <https://www.postgresql.org/docs/>
