# BrewLite - Agile Scrum

Ứng dụng đặt và thanh toán đồ uống không dùng tiền mặt, bài tập lớn môn Công nghệ Phần mềm, Đại học Sài Gòn.

## Phạm vi T01 - Hiển

Khởi tạo frontend Next.js (TypeScript, Tailwind CSS) và backend NestJS (TypeScript). Frontend hiển thị trang chào; backend có `GET /` trả `Hello World!`.

Chức năng Menu đã được triển khai trong T03, tích hợp với Products API từ T02. PostgreSQL và Prisma đã được bổ sung trong T02. Các chức năng giỏ hàng, đơn hàng, đăng nhập và thanh toán sẽ được triển khai ở những task tiếp theo. Zustand và Docker Compose sẽ được bổ sung theo kế hoạch của dự án.

## Phạm vi T02 - Thành

Tích hợp PostgreSQL và Prisma để lưu trữ sản phẩm. Backend cung cấp `GET /products` và `GET /products/:id`; Product gồm `id`, `name`, `price`, `imageUrl`, `stock`, đồng thời xử lý ID không hợp lệ và ID không tồn tại.

## Phạm vi T03 - Menu Page

Xây dựng trang Thực đơn (Menu Page) tại frontend Next.js App Router, kết nối trực tiếp với Products API từ backend:
- Gọi API thật `GET /products` để lấy danh sách đồ uống (không hardcode).
- Hiển thị danh sách sản phẩm dạng responsive grid thích ứng đa màn hình (từ mobile 375px đến desktop 1440px).
- Thẻ sản phẩm hiển thị đầy đủ: tên món, giá định dạng tiền tệ VND (`Intl.NumberFormat`), ảnh minh họa kèm fallback an toàn, trạng thái còn hàng/tạm hết hàng.
- Header/Navbar nhận diện thương hiệu BrewLite với phong cách cà phê hiện đại.
- Xử lý đầy đủ và chỉn chu các trạng thái: Loading skeleton shimmer, Empty state (danh sách rỗng), Error boundary (lỗi kết nối kèm nút thử lại) và Out of stock (hết hàng).
- Sử dụng TypeScript nghiêm ngặt, Next.js Server Components kết hợp Client Components tái sử dụng, semantic HTML.

## Cấu trúc

```text
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout, Header & Footer toàn trang
│   │   ├── page.tsx            # Menu Page Server Component gọi API GET /products
│   │   ├── loading.tsx         # Skeleton Loading tự động trong App Router
│   │   ├── error.tsx           # Error Boundary xử lý lỗi kết nối thân thiện
│   │   └── globals.css         # Tailwind CSS v4 & bảng màu chủ đạo cà phê
│   ├── components/
│   │   ├── Header.tsx          # Navbar nhận diện thương hiệu BrewLite, responsive
│   │   ├── ProductCard.tsx     # Thẻ sản phẩm (giá VND, badge kho, fallback ảnh)
│   │   └── ProductGrid.tsx     # Lưới responsive và empty state khi chưa có món
│   ├── services/
│   │   └── products.service.ts # Service fetch API GET /products & type guard validation
│   └── types/
│       └── product.ts          # TypeScript interface Product
├── next.config.ts              # Cấu hình Next.js (remotePatterns cho placehold.co)
└── .env.example                # Biến môi trường mẫu NEXT_PUBLIC_API_URL
backend/                        # NestJS, Prisma, PostgreSQL, src và test
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

## Hướng dẫn chạy và kiểm thử Menu Page (T03)

### 1. Công nghệ sử dụng trong T03

- **Next.js 16 (App Router)**: `page.tsx` là Server Component gọi API trực tiếp từ máy chủ, hỗ trợ Partial Prefetching và Turbopack.
- **React 19**: Kết hợp Client Components (`ProductCard.tsx`, `error.tsx`) để quản lý tương tác và fallback ảnh.
- **TypeScript 5**: Kiểu dữ liệu nghiêm ngặt qua interface `Product` và type-guard validation cấu trúc dữ liệu trả về từ API.
- **Tailwind CSS 4**: Thiết kế giao diện hiện đại phong cách cà phê (bảng màu Amber, Espresso, Stone), hỗ trợ responsive hoàn chỉnh từ mobile (375px) đến desktop (1440px).

### 2. Yêu cầu môi trường & Dịch vụ

Menu Page gọi API thật từ backend, do đó cần:
1. **PostgreSQL** đang chạy và đã khởi tạo bảng `Product` kèm seed dữ liệu mẫu (xem mục *Khởi tạo database cho T02*).
2. **Backend NestJS** đang chạy tại <http://localhost:3001>.
3. **Frontend Next.js** chạy tại <http://localhost:3000>.

### 3. Cấu hình biến môi trường Frontend

Frontend kết nối tới backend qua biến môi trường `NEXT_PUBLIC_API_URL`:

```powershell
cd frontend
Copy-Item .env.example .env.local
```

Nội dung `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

*Lưu ý:* `products.service.ts` được lập trình với cơ chế fallback tự động về `http://localhost:3001` nếu biến môi trường chưa được thiết lập.

### 4. Các bước khởi chạy và kiểm tra

**Bước 1: Khởi động Backend và kiểm tra dữ liệu API**

Terminal 1:
```powershell
cd backend
npm run start:dev
```

Kiểm tra API `GET /products` bằng PowerShell:
```powershell
Invoke-RestMethod http://localhost:3001/products
```
Kết quả mong đợi: Trả về mảng JSON chứa các sản phẩm mẫu (`Cà phê sữa`, `Bạc xỉu`, `Trà đào`, `Matcha latte`).

**Bước 2: Khởi động Frontend**

Terminal 2:
```powershell
cd frontend
npm run dev
```

Mở trình duyệt truy cập: <http://localhost:3000>.

### 5. Các trạng thái giao diện đã triển khai

| Trạng thái | Thành phần / File | Mô tả hành vi thực tế |
| --- | --- | --- |
| **Bình thường (Success)** | `page.tsx`, `ProductGrid.tsx`, `ProductCard.tsx` | Hiển thị Hero Banner và lưới sản phẩm responsive (1 cột mobile, 2 cột tablet, 3-4 cột desktop). Giá bán định dạng VND chuẩn (`Intl.NumberFormat('vi-VN')`). Badge *"Còn hàng"* xanh ngọc. |
| **Tải trang (Loading)** | `loading.tsx` | Next.js App Router tự động hiển thị Skeleton Shimmer loader tương ứng cấu trúc trang trong lúc chờ API phản hồi. |
| **Danh sách rỗng (Empty)** | `ProductGrid.tsx` | Khi API trả về mảng rỗng `[]`, hiển thị giao diện thông báo thân thiện: *"Chưa có sản phẩm nào. Hiện tại thực đơn của BrewLite đang được chuẩn bị..."*. |
| **Lỗi kết nối (Error)** | `error.tsx` | Khi backend không phản hồi hoặc fetch thất bại, giao diện hiển thị thông báo lỗi thân thiện kèm nút bấm **"Thử tải lại"** (`reset()`), không để lộ thông tin kỹ thuật nhạy cảm ra màn hình người dùng. |
| **Tạm hết hàng (Out of stock)** | `ProductCard.tsx` | Khi sản phẩm có `stock <= 0`, hiển thị badge *"Tạm hết hàng"*, làm mờ card (opacity 75%) và nhãn *"Hẹn lần sau"*. |
| **Fallback ảnh lỗi** | `ProductCard.tsx` | Khi URL hình ảnh lỗi hoặc không tải được, component tự động chuyển sang ảnh vector minh họa cốc cà phê sắc nét. |

### 6. Lệnh kiểm tra chất lượng mã nguồn Frontend

Tại thư mục `frontend`:

```powershell
cd frontend
npm run lint    # Kiểm tra chuẩn mã nguồn bằng ESLint (đạt 0 lỗi, 0 cảnh báo)
npm run build   # Build production với Next.js Turbopack
```

## Quy trình nhóm

Dự án gồm 10 task và 3 Sprint, từ 14/10/2026 đến 04/11/2026.

- T01 sử dụng branch `task-1/init-project`.
- T02 sử dụng branch `task-2/products-api`.
- T03 sử dụng branch `task-3/menu-page`.

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

## Kết quả kiểm tra T03 (16/10/2026)

- Frontend lint (`npm run lint`) đạt 0 lỗi, 0 cảnh báo.
- Frontend build production (`npm run build`) thành công trên Next.js 16.4.0 với Turbopack và Partial Prefetching.
- Tích hợp thành công với API thực tế `GET /products` từ backend NestJS.
- Giao diện responsive kiểm tra trực quan đạt chuẩn trên 4 kích thước viewport: 375px (Mobile), 768px (Tablet), 1024px (Laptop) và 1440px (Desktop).
- Hoạt động chính xác trên tất cả các kịch bản: hiển thị thực đơn, hết hàng, loading skeleton, danh sách rỗng, lỗi kết nối và fallback ảnh lỗi.

## Tài liệu công nghệ

- Next.js: <https://nextjs.org/docs/app/getting-started/installation>
- NestJS: <https://docs.nestjs.com/first-steps>
- Prisma ORM: <https://www.prisma.io/docs/orm>
- PostgreSQL: <https://www.postgresql.org/docs/>
