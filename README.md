# BrewLite - Agile Scrum

Ứng dụng đặt và thanh toán đồ uống không dùng tiền mặt, bài tập lớn môn Công nghệ Phần mềm, Đại học Sài Gòn.

## Phạm vi T01 - Hiển

Khởi tạo frontend Next.js (TypeScript, Tailwind CSS) và backend NestJS (TypeScript). Frontend hiển thị trang chào; backend có `GET /` trả `Hello World!`.

Products API được triển khai trong T02; Menu Page trong T03; Product Detail trong T04; Cart và Zustand trong T05; API tạo đơn hàng trong T06. Đăng nhập, thanh toán, lịch sử đơn và Docker Compose sẽ được triển khai ở những task tiếp theo.

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

## Phạm vi T04 - Product Detail

Xây dựng trang chi tiết sản phẩm tại route động `/products/[id]`, tích hợp trực tiếp với Products API:

- Gọi `GET /products/:id` để lấy dữ liệu sản phẩm thực tế.
- Hiển thị ảnh, tên, giá cơ bản và số lượng tồn kho.
- Cho phép chọn kích cỡ S, M, L và nhiều topping.
- Tự động cập nhật giá theo kích cỡ và topping đã chọn.
- Xử lý ID không hợp lệ, sản phẩm không tồn tại và lỗi kết nối API.
- Giao diện responsive, đồng bộ với Menu Page và thương hiệu BrewLite.

## Phạm vi T05 - Cart + Zustand

Xây dựng giỏ hàng phía frontend bằng Zustand:

- Thêm sản phẩm cùng kích cỡ và topping đã chọn vào giỏ hàng.
- Tự động gộp các CartItem có cùng sản phẩm, kích cỡ và topping.
- Tách thành dòng mới khi kích cỡ hoặc topping khác nhau.
- Tăng, giảm số lượng và xóa CartItem.
- Không cho tổng số lượng của một sản phẩm vượt quá tồn kho.
- Hiển thị tổng số lượng trên badge ở Header.
- Hiển thị đúng đơn giá, thành tiền từng dòng và tổng tiền tại `/cart`.
- Có empty state khi giỏ hàng không có sản phẩm.
- Kiểm thử Cart store bằng Vitest.

## Phạm vi T06 - API tạo đơn hàng

Backend cung cấp `POST /orders` để nhận giỏ hàng và tạo đơn:

- Request gồm danh sách `{ productId, size, quantity, toppings }`; `size` là `S`, `M` hoặc `L`, topping gửi bằng ID (`pearls`, `cream`, `jelly`).
- NestJS `ValidationPipe` cùng DTO `class-validator` từ chối request sai kiểu, thiếu món, size/topping không hỗ trợ hoặc thuộc tính thừa.
- Backend lấy giá gốc từ PostgreSQL, tự tính phụ phí size/topping, kiểm tra sản phẩm tồn tại và tổng số lượng không vượt tồn kho.
- Đơn và các dòng món được lưu cùng transaction ở trạng thái `PENDING`; response trả mã đơn, trạng thái, tổng tiền và chi tiết từng dòng.

Sau khi cập nhật source, áp dụng migration T06 lên PostgreSQL một lần:

```powershell
cd backend
npm run prisma:deploy
```

Kiểm thử DTO và nghiệp vụ tạo đơn:

```powershell
cd backend
npm test
```

Ví dụ gọi API:

```powershell
$body = @{
  items = @(
    @{
      productId = 1
      size = 'M'
      quantity = 2
      toppings = @('pearls')
    }
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post -Uri 'http://localhost:3001/orders' `
  -ContentType 'application/json' -Body $body
```

## Cấu trúc

```text
frontend/
├── src/
│   ├── app/
│   │   ├── cart/
│   │   │   └── page.tsx            # Trang giỏ hàng T05
│   │   ├── products/
│   │   │   └── [id]/
│   │   │       ├── page.tsx        # Trang chi tiết sản phẩm T04
│   │   │       └── not-found.tsx   # Giao diện sản phẩm không tồn tại
│   │   ├── layout.tsx              # Root layout, Header và Footer
│   │   ├── page.tsx                # Menu Page gọi GET /products
│   │   ├── loading.tsx             # Loading skeleton
│   │   ├── error.tsx               # Error Boundary
│   │   └── globals.css             # Tailwind CSS và màu chủ đạo
│   ├── components/
│   │   ├── Header.tsx              # Header và Cart quantity badge
│   │   ├── ProductCard.tsx         # Thẻ sản phẩm
│   │   ├── ProductGrid.tsx         # Lưới sản phẩm responsive
│   │   └── ProductOptions.tsx      # Chọn size, topping và Add to Cart
│   ├── services/
│   │   └── products.service.ts     # Gọi và kiểm tra dữ liệu Products API
│   ├── stores/
│   │   ├── cart.store.ts           # Zustand Cart store
│   │   └── cart.store.spec.ts      # Unit Test cho Cart store
│   └── types/
│       ├── product.ts              # Product interface
│       └── cart.ts                 # CartItem, CartSize và CartTopping
├── next.config.ts                  # Cấu hình Next.js
├── vitest.config.mts               # Cấu hình Vitest
└── .env.example                    # NEXT_PUBLIC_API_URL
backend/                            # NestJS, Prisma, PostgreSQL và tests
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
npm test
npm run build

cd ../backend
npm run lint
npm run build
npm test
npm run test:e2e
```

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

## Hướng dẫn kiểm thử Product Detail và Cart (T04–T05)

Trước khi kiểm thử, cần chạy PostgreSQL, Backend tại `http://localhost:3001` và Frontend tại `http://localhost:3000`.

### Kiểm thử T04 - Product Detail

1. Mở trang Menu tại <http://localhost:3000>.
2. Chọn một sản phẩm để mở route `/products/[id]`.
3. Kiểm tra ảnh, tên, tồn kho và giá sản phẩm.
4. Chọn lần lượt size S, M, L và các topping.
5. Xác nhận tổng giá thay đổi đúng theo lựa chọn.
6. Truy cập một ID không tồn tại để kiểm tra giao diện Not Found.

### Kiểm thử T05 - Cart + Zustand

1. Chọn size và topping tại trang chi tiết, sau đó nhấn **Thêm vào giỏ hàng**.
2. Thêm lại cùng cấu hình; Cart phải gộp thành một dòng và tăng quantity.
3. Thêm sản phẩm với size hoặc topping khác; Cart phải tạo dòng mới.
4. Mở `/cart`, kiểm tra tăng, giảm và xóa CartItem.
5. Xác nhận quantity badge, thành tiền từng dòng và tổng tiền cập nhật chính xác.
6. Xóa toàn bộ sản phẩm để kiểm tra empty state.
7. Kiểm tra giới hạn stock bằng nút tăng quantity.

Chạy kiểm thử tự động cho Cart store:

```powershell
cd frontend
npm test
```

## Quy trình nhóm

Dự án gồm 10 task và 3 Sprint, từ 14/10/2026 đến 04/11/2026.

- T01 sử dụng branch `task-1/init-project`.
- T02 sử dụng branch `task-2/products-api`.
- T03 sử dụng branch `task-3/menu-page`.
- T04 sử dụng branch `task-4/product-detail`.
- T05 sử dụng branch `task-5/cart`.
- T06 sử dụng branch `task-6/orders-api`.

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

## Kết quả kiểm tra T04 (18/10/2026)

- Route động `/products/[id]` hiển thị đúng chi tiết sản phẩm từ `GET /products/:id`.
- Hiển thị đầy đủ ảnh, tên, giá cơ bản và số lượng tồn kho.
- Lựa chọn size S, M, L và topping hoạt động chính xác.
- Tổng giá được cập nhật ngay theo kích cỡ và topping.
- ID không hợp lệ và sản phẩm không tồn tại được xử lý bằng giao diện phù hợp.
- Frontend lint và production build đạt.

## Kết quả kiểm tra T05 (20/10/2026)

- Cart state được quản lý bằng Zustand.
- Thêm, cập nhật quantity và xóa CartItem hoạt động chính xác.
- CartItem cùng sản phẩm, size và topping được gộp; cấu hình khác được tách thành dòng mới.
- Quantity badge bằng tổng quantity của toàn bộ CartItem.
- Đơn giá, thành tiền từng dòng và tổng tiền được tính chính xác.
- Giới hạn stock và empty state hoạt động đúng.
- Kiểm thử thủ công toàn bộ Acceptance Criteria đạt.
- Unit Test Cart store bằng Vitest đạt `4/4`.
- Frontend lint và production build đạt.

## Kết quả kiểm tra T06 (23/10/2026)

- `POST /orders` validate giỏ hàng, xác nhận sản phẩm và tồn kho, tự tính giá ở backend, lưu đơn cùng OrderItem ở trạng thái `PENDING`.
- Schema và migration PostgreSQL cho Order/OrderItem đã được áp dụng.
- DTO unit test, service unit test đạt; backend E2E đạt `7/7`.
- Backend lint, build và Prisma schema validation đạt.

## Tài liệu công nghệ

- Next.js: <https://nextjs.org/docs/app/getting-started/installation>
- NestJS: <https://docs.nestjs.com/first-steps>
- Prisma ORM: <https://www.prisma.io/docs/orm>
- PostgreSQL: <https://www.postgresql.org/docs/>
