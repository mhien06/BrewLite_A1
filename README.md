# BrewLite - Agile Scrum

Ứng dụng đặt và thanh toán đồ uống không dùng tiền mặt, bài tập lớn môn Công nghệ Phần mềm, Đại học Sài Gòn.

## Phạm vi T01 - Hiển

Khởi tạo frontend Next.js (TypeScript, Tailwind CSS) và backend NestJS (TypeScript). Frontend hiển thị trang chào; backend có `GET /` trả `Hello World!`.
Các chức năng menu, giỏ hàng, đơn hàng, đăng nhập và thanh toán thuộc những task tiếp theo. PostgreSQL, Prisma, Zustand và Docker Compose sẽ được bổ sung khi đến task tương ứng.

## Cấu trúc

```text
frontend/  # Next.js App Router, src/app
backend/   # NestJS, src và test
```

Hai ứng dụng có package.json và package-lock.json riêng; chạy npm trong thư mục tương ứng.

## Yêu cầu

- Node.js 24 LTS và npm 11.
- Truy cập npm registry để cài dependencies lần đầu.
- T01 chưa cần database hoặc tài khoản thanh toán.

## Cài đặt (PowerShell, từ thư mục gốc)

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
cd ../backend
npm ci
Copy-Item .env.example .env
cd ..
```

Chỉ sao chép env ở lần đầu để tránh ghi đè cấu hình đã có.

## Chạy phát triển

Terminal 1:

```powershell
cd frontend
npm run dev
```

Mở http://localhost:3000 để xem trang chào BrewLite.

Terminal 2:

```powershell
cd backend
npm run start:dev
```

Mở http://localhost:3001 hoặc chạy `Invoke-RestMethod http://localhost:3001` để nhận `Hello World!`.
Dừng ứng dụng bằng Ctrl+C.

## Biến môi trường

| Ứng dụng | Biến | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| frontend | NEXT_PUBLIC_API_URL | http://localhost:3001 | URL API dùng cho các task tiếp theo; biến public, không chứa bí mật |
| backend | PORT | 3001 | Cổng HTTP của backend |
| backend | FRONTEND_URL | http://localhost:3000 | Origin được phép gọi API qua CORS |

Next.js đọc `.env.local`. Backend đọc `.env` trong thư mục backend; biến có sẵn của hệ thống được ưu tiên. Các file env thật không được đưa lên Git, chỉ commit `.env.example`.

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
```

## Chạy bản production (sau khi build)

Trong hai terminal riêng:

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
T01 dùng nhánh `task-1/init-project`.
Quy trình: Issue → Branch → Code → Test → Commit → Push → Pull Request → Review → Merge → Done.
Không code trực tiếp trên main. Merge và đóng Issue theo quyết định của nhóm/người dùng.
Task chỉ được đánh dấu Done sau khi đáp ứng tiêu chí chấp nhận, kiểm tra đạt, review và merge.

## Kết quả kiểm tra T01 (14/10/2026)

- Frontend: lint và production build đạt; `GET /` trả HTTP 200 và trang chào BrewLite.
- Backend: lint, build, unit test (1) và e2e test (1) đạt; `GET /` trả HTTP 200, `Hello World!`.
- CORS cho phép origin `http://localhost:3000`.
- `npm audit --omit=dev`: không có cảnh báo ở cả hai ứng dụng tại thời điểm kiểm tra.
- Frontend có 5 cảnh báo mức high trong dependencies phát triển của ESLint (chuỗi braces/micromatch/fast-glob). npm đề xuất hạ major eslint-config-next; chưa áp dụng vì không tương thích cấu hình hiện tại. Cần theo dõi bản sửa upstream.


## Tài liệu công nghệ

- Next.js: https://nextjs.org/docs/app/getting-started/installation
- NestJS: https://docs.nestjs.com/first-steps
