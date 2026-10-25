# BrewLite - Agile Scrum

Ứng dụng đặt và thanh toán đồ uống không dùng tiền mặt, bài tập lớn môn Công nghệ Phần mềm, Đại học Sài Gòn.

## Phạm vi T01 - Hiển

Khởi tạo frontend Next.js (TypeScript, Tailwind CSS) và backend NestJS (TypeScript). Frontend hiển thị trang chào; backend có `GET /` trả `Hello World!`.

Products API được triển khai trong T02; Menu Page trong T03; Product Detail trong T04; Cart và Zustand trong T05; API tạo đơn hàng trong T06; đăng ký, đăng nhập và bảo vệ API bằng JWT trong T07. Thanh toán và lịch sử đơn vẫn sẽ được triển khai ở những task tiếp theo.

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

Nút **Thanh toán** ở trang giỏ hàng hiện chưa hoạt động. T06 mới cung cấp API tạo đơn ở backend, chưa nối thao tác tạo đơn từ giao diện. Để kiểm tra phần này, làm theo mục [Hướng dẫn kiểm thử API tạo đơn (T06)](#hướng-dẫn-kiểm-thử-api-tạo-đơn-t06) bên dưới.

## Phạm vi T07 - Đăng ký, đăng nhập và JWT

Backend cung cấp đăng ký tài khoản, đăng nhập và endpoint thông tin người dùng hiện tại. Tên đăng ký phải viết HOA; email đăng ký phải có đuôi `@gmail.com`; mật khẩu được băm bằng bcrypt trước khi lưu. Đăng ký không tự đăng nhập; người dùng cần đăng nhập bằng email và mật khẩu vừa tạo.

Mật khẩu đăng ký phải dài ít nhất 6 ký tự; mật khẩu ở cả đăng ký và đăng nhập không được vượt quá 72 byte UTF-8. Giới hạn này tránh bcrypt bỏ qua phần mật khẩu vượt quá 72 byte.

| Method | Endpoint | Kết quả |
| ------ | -------- | ------- |
| POST | `/auth/register` | Tạo tài khoản; trả HTTP 201, không cấp JWT |
| POST | `/auth/login` | Đăng nhập; trả HTTP 200 cùng `accessToken` và thông tin người dùng |
| GET | `/auth/me` | Trả thông tin tài khoản hiện tại; yêu cầu Bearer JWT |
| POST | `/orders` | Tạo đơn hàng; yêu cầu Bearer JWT |

Request đăng ký gồm `name`, `email`, `password`; request đăng nhập gồm `email`, `password`. Dữ liệu không hợp lệ trả HTTP 400, email đã được dùng trả HTTP 409, thông tin đăng nhập sai hoặc thiếu JWT hợp lệ trả HTTP 401.

Để gọi `POST /orders`, trước tiên đăng nhập và lấy `accessToken` từ response, sau đó gửi header `Authorization: Bearer <accessToken>`. Ví dụ T06 không gửi token sẽ bị chặn bằng HTTP 401.

`JwtAuthGuard` bảo vệ `GET /auth/me` và `POST /orders`. Gửi token đăng nhập trong header `Authorization: Bearer <accessToken>`. Guard xác minh chữ ký và thời hạn token, sau đó xác nhận người dùng vẫn tồn tại trong database trước khi cho phép gọi controller.

`JWT_SECRET` là bắt buộc; backend dừng khởi động nếu biến này bị thiếu và không dùng khóa dự phòng. Tạo chuỗi ngẫu nhiên riêng cho từng môi trường, không dùng giá trị mẫu và không commit `backend/.env`:

```powershell
node -e "console.log(require('node:crypto').randomBytes(64).toString('hex'))"
```

Đặt chuỗi kết quả vào `JWT_SECRET` trong `backend/.env`. `JWT_EXPIRES_IN` cấu hình thời hạn token, mặc định `7d`. Nếu mật khẩu database từng được commit hoặc chia sẻ, hãy đổi mật khẩu đó và cập nhật `DATABASE_URL` trong file `.env` cục bộ.

Migration T07 tạo bảng user cho database hiện có và đồng bộ sequence ID để các user mới nhận ID chưa sử dụng. Để chạy và kiểm thử:

```powershell
cd backend
Copy-Item .env.example .env
# Thay YOUR_PASSWORD và change-me... bằng thông tin riêng, đặc biệt tạo JWT_SECRET ngẫu nhiên.
npm run prisma:deploy
npm run start:dev
```

Mở terminal khác tại `backend` để chạy `npm test`, `npm run test:e2e`, `npm run lint` và `npm run build`. E2E đọc cấu hình `.env` nếu có nhưng không ghi đè các biến môi trường đã được cung cấp.

## Cấu trúc dự án đến T07

Các thư mục và file chính hiện có trong dự án. Phần `orders/` và migration `add_orders` được bổ sung ở T06; phần `auth/` và migration `add_users` được bổ sung ở T07 để quản lý tài khoản và bảo vệ API.

```text
BrewLite-Scrum/
├── frontend/                         # Giao diện Next.js
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx               # Trang Menu gọi GET /products (T03)
│   │   │   ├── products/[id]/         # Chi tiết sản phẩm, trang không tìm thấy (T04)
│   │   │   ├── cart/page.tsx          # Trang giỏ hàng (T05)
│   │   │   ├── layout.tsx             # Bố cục chung, Header và Footer
│   │   │   ├── loading.tsx            # Giao diện đang tải
│   │   │   ├── error.tsx              # Giao diện lỗi và thử lại
│   │   │   └── globals.css            # Tailwind CSS và kiểu giao diện chung
│   │   ├── components/                # Header, thẻ sản phẩm, lưới món, chọn size/topping
│   │   ├── services/
│   │   │   └── products.service.ts    # Gọi và kiểm tra dữ liệu API sản phẩm
│   │   ├── stores/
│   │   │   ├── cart.store.ts          # Quản lý giỏ hàng bằng Zustand
│   │   │   └── cart.store.spec.ts     # Kiểm thử giỏ hàng
│   │   └── types/                     # Kiểu dữ liệu sản phẩm và giỏ hàng
│   ├── public/products/               # Ảnh đồ uống
│   ├── next.config.ts                 # Cấu hình Next.js
│   ├── vitest.config.mts              # Cấu hình kiểm thử frontend
│   ├── .env.example                   # Mẫu URL backend
│   ├── package.json                   # Thư viện và lệnh chạy frontend
│   └── package-lock.json              # Phiên bản thư viện đã khóa
├── backend/                          # REST API NestJS
│   ├── src/
│   │   ├── products/                  # Controller, service, module sản phẩm (T02)
│   │   ├── orders/                    # API tạo đơn (T06)
│   │   │   ├── dto/
│   │   │   │   ├── create-order.dto.ts       # Kiểm tra danh sách món
│   │   │   │   └── create-order-item.dto.ts  # Kiểm tra sản phẩm, size, topping, số lượng
│   │   │   ├── orders.controller.ts   # Nhận POST /orders
│   │   │   ├── orders.service.ts      # Kiểm tra tồn kho, tính tiền và lưu đơn
│   │   │   └── orders.module.ts       # Khai báo module đơn hàng
│   │   ├── prisma/                    # Module và service kết nối database
│   │   ├── app.controller.ts          # Endpoint GET / ban đầu
│   │   ├── app.controller.spec.ts     # Kiểm thử endpoint ban đầu
│   │   ├── app.service.ts             # Xử lý lời chào ban đầu
│   │   ├── app.module.ts              # Kết nối các module của ứng dụng
│   │   └── main.ts                    # Khởi động backend, validation và CORS
│   ├── prisma/
│   │   ├── migrations/
│   │   │   ├── 20261015124827_init_products/  # Tạo bảng Product (T02)
│   │   │   └── 20261023120000_add_orders/     # Tạo Order và OrderItem (T06)
│   │   ├── schema.prisma              # Mô hình Product, Order và OrderItem
│   │   └── seed.ts                    # Thêm món mẫu, cập nhật ảnh món đã có
│   ├── test/app.e2e-spec.ts           # Kiểm thử E2E đang có trong repo
│   ├── prisma7.config.ts              # Cấu hình Prisma, migration và seed
│   ├── vitest.config.ts               # Cấu hình unit test backend
│   ├── vitest.config.e2e.ts           # Cấu hình E2E backend
│   ├── .env.example                   # Mẫu cấu hình cổng, CORS và database
│   ├── package.json                   # Thư viện và lệnh chạy backend
│   └── package-lock.json              # Phiên bản thư viện đã khóa
└── README.md                          # Giới thiệu, cài đặt, chạy và kiểm thử
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

### Khởi tạo database

Bật dịch vụ PostgreSQL trước khi tạo database hoặc chạy backend. Trên Windows, mở **Services**, tìm dịch vụ PostgreSQL đã cài và chọn **Start** nếu dịch vụ đang dừng.

Chỉ tạo database một lần:

```powershell
psql -U postgres -d postgres -c "CREATE DATABASE brewlite_scrum;"
```

Nếu PowerShell báo không nhận lệnh `psql`, bạn có thể tạo database bằng **pgAdmin**:

1. Mở pgAdmin và kết nối tới PostgreSQL trên máy bằng tài khoản `postgres` cùng mật khẩu đã đặt khi cài.
2. Nhấp phải vào **Databases**, chọn **Create → Database…**.
3. Nhập tên `brewlite_scrum`, chọn **Save**.

Chọn một trong hai cách trên; nếu database đã tồn tại thì bỏ qua bước tạo. Nếu muốn dùng `psql`, thêm thư mục `bin` của PostgreSQL vào PATH rồi mở lại PowerShell.

Trong `backend/.env`, thay `YOUR_PASSWORD` bằng mật khẩu PostgreSQL:

```env
PORT=3001
FRONTEND_URL=http://localhost:3000
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/brewlite_scrum?schema=public"
JWT_SECRET=change-me-to-a-long-random-string
JWT_EXPIRES_IN=7d
```

Áp dụng migration và thêm dữ liệu mẫu:

```powershell
cd backend
npm run prisma:deploy
npm run prisma:seed
cd ..
```

Lệnh seed thêm các món mẫu chưa có trong bảng `Product`. Với món đã có cùng tên, seed chỉ cập nhật đường dẫn ảnh; giá và tồn kho hiện có được giữ nguyên. Các migration trong lệnh `prisma:deploy` bao gồm cả bảng sản phẩm và bảng đơn hàng của T06.

## Chạy phát triển

Chạy theo thứ tự **PostgreSQL → backend → frontend**. Trang Menu cần gọi API sản phẩm nên backend phải sẵn sàng trước khi mở frontend.

Sau khi hoàn tất phần cài đặt và khởi tạo database, mở terminal thứ nhất tại thư mục gốc dự án để chạy backend:

```powershell
cd backend
npm run start:dev
```

Giữ terminal này chạy. Trong terminal thứ hai, kiểm tra API:

```powershell
Invoke-RestMethod http://localhost:3001/products
```

Khi API trả về danh sách sản phẩm, chạy frontend từ thư mục gốc trong terminal thứ hai:

```powershell
cd frontend
npm run dev
```

Mở <http://localhost:3000> để dùng BrewLite. Backend chạy tại <http://localhost:3001>. Dừng từng ứng dụng bằng `Ctrl + C` trong terminal tương ứng.

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
| backend  | JWT_SECRET          | Bắt buộc              | Khóa bí mật riêng để ký và xác minh JWT; không commit   |
| backend  | JWT_EXPIRES_IN      | 7d                    | Thời hạn JWT, ví dụ `1h`, `7d`                          |

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
1. **PostgreSQL** đang chạy và đã khởi tạo bảng `Product` kèm seed dữ liệu mẫu (xem mục *Khởi tạo database*).
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

## Hướng dẫn kiểm thử API tạo đơn (T06)

Phần này kiểm tra bằng tay qua API, không cần chạy test tự động. Chỉ cần PostgreSQL và backend đang chạy; frontend không cần mở vì nút Thanh toán chưa kết nối với API tạo đơn.

### 1. Chuẩn bị sản phẩm

Mở một terminal PowerShell khác, giữ terminal backend chạy. Lấy danh sách sản phẩm và chọn một món còn ít nhất 2 phần:

```powershell
$products = @(Invoke-RestMethod http://localhost:3001/products)
$products | Format-Table id, name, price, stock
$product = $products | Where-Object { $_.stock -ge 2 } | Select-Object -First 1
if ($null -eq $product) {
  throw 'Cần ít nhất một sản phẩm có stock >= 2 để thử ví dụ này.'
}
```

Nếu chưa có sản phẩm, chạy seed theo phần cài đặt. Nếu các món đều hết hàng, chuẩn bị lại tồn kho trên database thử nghiệm; chạy seed không đặt lại tồn kho của món đã có.

### 2. Đăng nhập để lấy JWT

`POST /orders` yêu cầu tài khoản đã đăng nhập. Dùng email và mật khẩu của tài khoản đã đăng ký theo [hướng dẫn T07](#hướng-dẫn-kiểm-thử-đăng-ký-đăng-nhập-và-guard-tạo-đơn-t07), hoặc thay hai giá trị mẫu dưới đây bằng tài khoản của bạn:

```powershell
$credentials = @{
  email = 'your-account@gmail.com'
  password = 'your-password'
}
$login = Invoke-RestMethod -Method Post `
  -Uri 'http://localhost:3001/auth/login' `
  -ContentType 'application/json; charset=utf-8' `
  -Body ($credentials | ConvertTo-Json)
$token = $login.accessToken
```

Đăng nhập thành công trả HTTP `200` và `accessToken`. Nếu bỏ qua bước này hoặc không gửi token, `POST /orders` sẽ trả HTTP `401`.

### 3. Gửi giỏ hàng hợp lệ

Tiếp tục trong cùng terminal để dùng sản phẩm vừa chọn:

```powershell
$payload = @{
  items = @(
    @{
      productId = $product.id
      size = 'M'
      quantity = 2
      toppings = @('pearls')
    }
  )
}
$body = $payload | ConvertTo-Json -Depth 5
$response = Invoke-WebRequest -UseBasicParsing -Method Post `
  -Uri 'http://localhost:3001/orders' `
  -ContentType 'application/json; charset=utf-8' `
  -Headers @{ Authorization = "Bearer $token" } -Body $body
$response.StatusCode
$order = $response.Content | ConvertFrom-Json
$order | ConvertTo-Json -Depth 5
$expectedTotal = ($product.price + 5000 + 8000) * 2
$expectedTotal
```

Kết quả cần đối chiếu:

- HTTP `201`, có mã đơn `id`, trạng thái `PENDING` và thời điểm tạo `createdAt`.
- Dòng món có đúng `productId`, size `M`, quantity `2` và topping `pearls`.
- `unitPrice` bằng giá gốc cộng 5.000đ cho size M và 8.000đ cho trân châu.
- `lineTotal` và `total` đều bằng `$expectedTotal`.

Ví dụ món giá 29.000đ thì đơn trên có tổng tiền 84.000đ. Phụ phí size S/M/L lần lượt là 0đ/5.000đ/10.000đ; topping `pearls` là 8.000đ, `cream` là 10.000đ và `jelly` là 7.000đ.

Nếu dùng **Postman**, chọn `POST http://localhost:3001/orders`, vào **Authorization → Bearer Token** và dán `accessToken` nhận từ bước đăng nhập; vào **Body → raw → JSON** để gửi giỏ hàng. ID phải lấy từ `GET /products`, không mặc định là 1.

### 4. Kiểm tra đơn đã lưu trong database

Trong pgAdmin, chọn database `brewlite_scrum` rồi mở **Query Tool**. Thay `MA_DON` bằng giá trị `$order.id` vừa nhận:

```sql
SELECT "id", "status", "total", "createdAt"
FROM "Order"
WHERE "id" = MA_DON;

SELECT "productId", "size", "toppings", "quantity", "unitPrice", "lineTotal"
FROM "OrderItem"
WHERE "orderId" = MA_DON;
```

Phải có một đơn và một dòng món với nội dung khớp response. Mỗi lần gửi request hợp lệ sẽ tạo một đơn mới. T06 chỉ kiểm tra tồn kho khi tạo đơn, chưa trừ hoặc giữ hàng và chưa xử lý thanh toán.

### 5. Thử dữ liệu không hợp lệ

Trong Postman, bắt đầu lại từ JSON hợp lệ ở bước 3 cho mỗi trường hợp. Chỉ thay dữ liệu được nêu trong bảng rồi gửi lại:

| Trường hợp | Dữ liệu gửi | Kết quả mong đợi |
| --- | --- | --- |
| Giỏ rỗng | Body là `{"items": []}` | HTTP 400 |
| Thiếu giỏ hàng | Body là `{}` | HTTP 400 |
| Số lượng không hợp lệ | Đổi `quantity` thành `0`, `-1`, `1.5` hoặc chuỗi `"2"`; thử từng giá trị | HTTP 400 |
| Size không hỗ trợ | Đổi `size` thành `"XL"` | HTTP 400 |
| Topping không hỗ trợ | Đổi `toppings` thành `["syrup"]` | HTTP 400 |
| Topping bị lặp | Đổi `toppings` thành `["pearls", "pearls"]` | HTTP 400 |
| Sản phẩm không tồn tại | Dùng một ID số nguyên dương chưa có trong database | HTTP 404 |
| Vượt tồn kho | Đặt `quantity` bằng `stock + 1` của sản phẩm đã chọn | HTTP 400 |
| Tổng số lượng vượt kho | Gửi hai dòng cùng `productId`, mỗi dòng quantity bằng stock của món đó | HTTP 400 |
| Tự gửi giá từ client | Thêm thuộc tính `"total": 1` ở cấp ngoài, cạnh `items` | HTTP 400 |

Response lỗi phải có thông báo phù hợp. Để xác nhận request lỗi không lưu đơn, chạy câu SQL dưới đây trước và sau khi thử; số đơn phải giữ nguyên. Thực hiện lúc không có người khác tạo đơn trong cùng database.

```sql
SELECT COUNT(*) AS order_count FROM "Order";
```

Có thể ghi lại trường hợp thử, kết quả thực tế và ảnh response để nhóm đối chiếu khi review.

## Hướng dẫn kiểm thử đăng ký, đăng nhập và guard tạo đơn (T07)

Yêu cầu: PostgreSQL đã chạy, migration đã áp dụng, backend đang chạy tại `http://localhost:3001`, và `JWT_SECRET` đã được cấu hình riêng trong `backend/.env`. Frontend không cần chạy. Có thể dùng PowerShell theo các bước dưới đây hoặc gửi cùng request bằng Postman.

### 1. Đăng ký tài khoản

Tạo email riêng để có thể chạy lại hướng dẫn nhiều lần. Tên phải viết HOA, email phải kết thúc bằng `@gmail.com`, mật khẩu đăng ký dài ít nhất 6 ký tự và cả mật khẩu đăng ký/đăng nhập không được vượt quá 72 byte UTF-8:

```powershell
$email = "t07-$([guid]::NewGuid().ToString('N'))@gmail.com"
$password = 'BrewLiteTest123!'
$register = @{
  name = 'BREWLITE TEST USER'
  email = $email
  password = $password
}
$registerResponse = Invoke-WebRequest -UseBasicParsing -Method Post `
  -Uri 'http://localhost:3001/auth/register' `
  -ContentType 'application/json; charset=utf-8' `
  -Body ($register | ConvertTo-Json)
$registerResponse.StatusCode
$registeredUser = $registerResponse.Content | ConvertFrom-Json
$registeredUser.user
```

Kết quả mong đợi: HTTP `201`, response có `user` nhưng không có `accessToken`. Mật khẩu dài hơn 72 byte phải bị từ chối bằng HTTP `400` ở cả `/auth/register` và `/auth/login`.

### 2. Đăng nhập và kiểm tra JWT

```powershell
$credentials = @{ email = $email; password = $password }
$loginResponse = Invoke-WebRequest -UseBasicParsing -Method Post `
  -Uri 'http://localhost:3001/auth/login' `
  -ContentType 'application/json; charset=utf-8' `
  -Body ($credentials | ConvertTo-Json)
$loginResponse.StatusCode
$login = $loginResponse.Content | ConvertFrom-Json
$token = $login.accessToken
$login.user
```

Kết quả mong đợi: HTTP `200`, có `accessToken` và thông tin user với ID trùng `$registeredUser.user.id`. Gửi sai email hoặc mật khẩu trả HTTP `401`. Có thể xác nhận token hoạt động bằng endpoint hiện tại:

```powershell
Invoke-RestMethod -Method Get -Uri 'http://localhost:3001/auth/me' `
  -Headers @{ Authorization = "Bearer $token" }
```

Kết quả mong đợi: thông tin tài khoản vừa đăng ký; thiếu hoặc sai token trả HTTP `401`.

### 3. Kiểm tra guard của `POST /orders`

Lấy sản phẩm còn hàng và chuẩn bị một đơn hợp lệ:

```powershell
$products = @(Invoke-RestMethod 'http://localhost:3001/products')
$product = $products | Where-Object { $_.stock -ge 1 } | Select-Object -First 1
if ($null -eq $product) {
  throw 'Cần ít nhất một sản phẩm có stock >= 1 để thử ví dụ này.'
}
$orderBody = @{
  items = @(@{
    productId = $product.id
    size = 'S'
    quantity = 1
    toppings = @()
  })
} | ConvertTo-Json -Depth 5
```

Thử thiếu token và token sai; cả hai request phải bị chặn trước khi tạo đơn với HTTP `401`:

```powershell
try {
  Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'http://localhost:3001/orders' `
    -ContentType 'application/json; charset=utf-8' -Body $orderBody
  throw 'Lỗi: request thiếu token không bị chặn.'
} catch {
  if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 401) {
    throw
  }
  'Thiếu token: HTTP 401 như mong đợi.'
}

try {
  Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'http://localhost:3001/orders' `
    -ContentType 'application/json; charset=utf-8' `
    -Headers @{ Authorization = 'Bearer invalid-token' } -Body $orderBody
  throw 'Lỗi: request dùng token sai không bị chặn.'
} catch {
  if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 401) {
    throw
  }
  'Token sai: HTTP 401 như mong đợi.'
}
```

Gửi lại cùng giỏ hàng với JWT hợp lệ:

```powershell
$orderResponse = Invoke-WebRequest -UseBasicParsing -Method Post `
  -Uri 'http://localhost:3001/orders' `
  -ContentType 'application/json; charset=utf-8' `
  -Headers @{ Authorization = "Bearer $token" } -Body $orderBody
$orderResponse.StatusCode
$order = $orderResponse.Content | ConvertFrom-Json
$order
```

Kết quả mong đợi: HTTP `201`, trạng thái `PENDING`, và `userId` của đơn bằng `$login.user.id`. Trong pgAdmin, xác nhận thông tin tài khoản và mật khẩu đã băm (không bằng plaintext) cùng đơn hàng:

```sql
SELECT "id", "email", left("passwordHash", 4) AS hash_prefix,
       "passwordHash" <> 'BrewLiteTest123!' AS password_is_hashed
FROM "User"
WHERE "email" = 'EMAIL_DA_DANG_KY';

SELECT "id", "userId", "status", "total", "createdAt"
FROM "Order"
WHERE "id" = MA_DON;
```

Thay `EMAIL_DA_DANG_KY` bằng `$email` và `MA_DON` bằng `$order.id`. Kết quả user phải có `hash_prefix` bắt đầu bằng `$2` và `password_is_hashed` là `true`; `userId` của đơn phải bằng ID user vừa đăng nhập. Request thiếu/sai token không tạo đơn.

## Quy trình nhóm

Dự án gồm 10 task và 3 Sprint, từ 14/10/2026 đến 04/11/2026.

- T01 sử dụng branch `task-1/init-project`.
- T02 sử dụng branch `task-2/products-api`.
- T03 sử dụng branch `task-3/menu-page`.
- T04 sử dụng branch `task-4/product-detail`.
- T05 sử dụng branch `task-5/cart`.
- T06 sử dụng branch `task-6/orders-api`.
- T07 sử dụng branch `task-7/auth-jwt`.

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
- DTO unit test, service unit test đạt; backend E2E đạt `7/7` tại thời điểm kiểm tra. Code test riêng của T06 sau đó được tách để lưu trên máy cá nhân; kết quả này không phải số lượng test hiện có trong repository.
- Backend lint, build và Prisma schema validation đạt.

## Tài liệu công nghệ

- Next.js: <https://nextjs.org/docs/app/getting-started/installation>
- NestJS: <https://docs.nestjs.com/first-steps>
- Prisma ORM: <https://www.prisma.io/docs/orm>
- PostgreSQL: <https://www.postgresql.org/docs/>
