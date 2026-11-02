# BrewLite — Assignment 1

Ứng dụng đặt và thanh toán đồ uống không dùng tiền mặt, môn Công nghệ Phần mềm — Đại học Sài Gòn.

Dự án sử dụng Next.js, NestJS, PostgreSQL và Prisma. Thanh toán ví/thẻ là mô phỏng, không kết nối cổng thanh toán thật.

## 1. Phạm vi thực hiện

| Task | Chức năng |
|---|---|
| T01 | Khởi tạo frontend/backend, Git, cấu hình môi trường và README |
| T02 | Database sản phẩm và Products API |
| T03 | Menu, trạng thái tải dữ liệu và danh sách trống |
| T04 | Chi tiết món, chọn size S/M/L và topping, tính giá |
| T05 | Giỏ hàng: thêm, đổi số lượng, xóa và tính tổng bằng Zustand |
| T06 | Tạo đơn PENDING, kiểm tra dữ liệu đầu vào, lưu đơn và trả mã đơn |
| T07 | Đăng ký, đăng nhập, bcrypt và bảo vệ API bằng JWT |
| T08 | Checkout và mô phỏng thanh toán WALLET/CARD; thất bại giữ giỏ để thử lại |
| T09 | Xác nhận, lịch sử đơn, Docker Compose và hướng dẫn bàn giao |
| T10 | State Machine, Idempotency-Key, transaction/optimistic locking cho tồn kho, khuyến mãi và điểm thưởng |

**Phần mở rộng:** trang nhân viên quản lý nguyên liệu, công thức, đơn đã thanh toán, xem điểm/lịch sử và lịch sử kho. Tài khoản nhân viên không dùng chức năng mua hàng.

## 2. Cấu trúc dự án

```text
BrewLite_A1/
├── backend/
│   ├── prisma/             # Schema, migration và seed
│   ├── scripts/            # Cấp/thu hồi quyền nhân viên
│   ├── src/                # API, nghiệp vụ và unit test (*.spec.ts)
│   ├── test/               # E2E và kiểm thử PostgreSQL
│   ├── vitest.config*.ts    # Cấu hình kiểm thử
│   ├── .env.example
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── public/products/    # Ảnh đồ uống
│   ├── src/                # Trang, component, store, service và unit test
│   ├── .env.example
│   ├── Dockerfile
│   └── package.json
├── .env.example            # Cấu hình Docker Compose mẫu
├── docker-compose.yml      # PostgreSQL + API + web
└── README.md
```

Các lệnh bên dưới dùng PowerShell và chạy tại thư mục gốc dự án, trừ khi có hướng dẫn chuyển thư mục.

## 3. Chạy bằng Docker Compose

### Lần đầu trên máy mới

Cài Docker Desktop, mở ứng dụng và đợi **Engine running**. Node.js trên máy chỉ cần nếu chọn cách chạy trực tiếp ở mục 4.

```powershell
Copy-Item .env.example .env
```

Nếu đã có `.env`, giữ file hiện tại. Điền `JWT_SECRET` trong `.env`; có thể tạo chuỗi ngẫu nhiên bằng PowerShell:

```powershell
$jwtBytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($jwtBytes)
[Convert]::ToBase64String($jwtBytes)
```

Dán kết quả vào `JWT_SECRET`, sau đó chạy:

```powershell
docker compose up --build -d
docker compose ps
docker compose exec api npm run prisma:seed
```

API tự chạy migration trước khi khởi động. Đợi API/PostgreSQL có trạng thái `healthy` và web ở trạng thái `Up` trước khi seed hoặc mở web.

| Thành phần | Địa chỉ mặc định |
|---|---|
| Trang khách hàng | http://localhost:3000 |
| Đăng nhập | http://localhost:3000/login |
| Trang nhân viên | http://localhost:3000/staff |
| API sản phẩm | http://localhost:3001/products |
| PostgreSQL | localhost:5432 |

Seed tạo món, nguyên liệu/công thức mẫu, khuyến mãi và tài khoản khách `customer@gmail.com` / `password123` nếu tài khoản chưa tồn tại. Đây là tài khoản demo. Seed không xóa database và không đặt lại mật khẩu tài khoản đã có; seed có cập nhật các cấu hình mẫu như khuyến mãi.

### Các lần chạy sau

```powershell
docker compose up -d
```

Sau khi pull code mới hoặc sửa code, chạy lại `docker compose up --build -d`. Không cần seed mỗi lần khởi động.

```powershell
docker compose logs --tail 80 api web
docker compose down
```

`down` dừng bộ ứng dụng và giữ dữ liệu. **Không dùng `down -v` nếu cần giữ database.**

### Cổng và database cũ

- Project mặc định tên `brewlite`, gồm 3 service; trang khách và trang nhân viên dùng chung bộ này.
- Nếu cổng bận, đổi `WEB_PORT`, `API_PORT`, `POSTGRES_PORT` trong `.env`. Cập nhật `FRONTEND_URL` theo cổng web và `NEXT_PUBLIC_API_URL` theo cổng API, rồi build lại.
- Máy mới để `POSTGRES_VOLUME_NAME` trống và `POSTGRES_VOLUME_EXTERNAL=false`.
- Nếu trước đây dùng project `brewlite-t09-check`, muốn giữ database cũ: sao lưu database, dừng bộ cũ, đặt `POSTGRES_VOLUME_NAME=brewlite-t09-check_postgres_data` và `POSTGRES_VOLUME_EXTERNAL=true`. Chỉ dùng tên này khi volume đó thực sự tồn tại; không chạy hai PostgreSQL cùng mở một volume.

## 4. Chạy phát triển trực tiếp trên máy

Cần Node.js 24, npm và PostgreSQL 16. Không chạy đồng thời với Docker trên cùng cổng.

Tạo database `brewlite_scrum` trong PostgreSQL. Cài backend:

```powershell
cd backend
npm ci
Copy-Item .env.example .env
```

Sửa `DATABASE_URL`, `JWT_SECRET` và `FRONTEND_URL` trong `backend/.env` theo máy của bạn. Giữ cấu hình đang có nếu đã cài trước đó.

```powershell
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
npm run start:dev
```

Mở terminal thứ hai tại thư mục gốc:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Frontend dùng `NEXT_PUBLIC_API_URL` cho trình duyệt và `API_URL_INTERNAL` cho phía server; mặc định cả hai là `http://localhost:3001` khi chạy trực tiếp.

## 5. Sử dụng trang nhân viên (mở rộng)

1. Đăng ký tài khoản trên web bằng email dành cho nhân viên.
2. Cấp quyền cho tài khoản đã tồn tại:

```powershell
docker compose exec api npm run staff:role -- nhanvien@example.com STAFF
```

3. Đăng xuất rồi đăng nhập lại và vào `/staff`. Để quan sát đồng thời khách và nhân viên, dùng hai trình duyệt hoặc một cửa sổ thường và một cửa sổ ẩn danh.
4. Khi cần thu hồi quyền, thay `STAFF` bằng `CUSTOMER`.

Nếu chạy trực tiếp, dùng `npm run staff:role -- nhanvien@example.com STAFF` tại thư mục `backend`.

Nhân viên nhập/điều chỉnh kho kèm lý do, xem công thức và chuyển trạng thái đơn. Điểm thưởng chỉ được xem, không chỉnh thủ công.

## 6. Nghiệp vụ T10

- **Trạng thái:** `PENDING → PAID / PAYMENT_FAILED / CANCELLED`; `PAYMENT_FAILED → PENDING / CANCELLED`; `PAID → PREPARING / CANCELLED`; `PREPARING → READY`; `READY → COMPLETED`. `CANCELLED` và `COMPLETED` là trạng thái kết thúc.
- **Hủy đơn PAID:** trước khi pha, hoàn kho theo snapshot và thu hồi điểm trong transaction đúng một lần. Không hủy từ PREPARING. Đơn cũ thiếu snapshot trả lỗi để đối soát, không tự đoán lượng hoàn. Chưa có hoàn tiền qua cổng thật.
- **Chống thanh toán lặp:** gửi lại cùng `Idempotency-Key` và dữ liệu trả kết quả đã lưu, không trừ kho/cộng điểm thêm; cùng khóa nhưng khác dữ liệu bị từ chối.
- **Tồn kho:** kiểm tra cả món theo size và số phần topping, tính nguyên liệu dùng chung của toàn giỏ. Chặn thêm/tăng/lưu lựa chọn vượt kho. Kiểm tra giỏ chưa giữ chỗ; khi thanh toán backend vẫn kiểm tra và trừ kho trong transaction với optimistic locking.
- **Menu:** số ly hiển thị được quy đổi theo công thức size S; số thực tế mua được phụ thuộc size, topping và các món trong giỏ.
- **Khuyến mãi mẫu:** `BREW10` giảm 10% cho đơn từ 50.000đ, tối đa 20.000đ; `GIAM15K` giảm 15.000đ cho đơn từ 60.000đ.
- **Điểm thưởng:** mỗi 10.000đ thực thanh toán thành công tích 1 điểm, lấy phần nguyên; không cộng lặp khi gửi lại yêu cầu.

## 7. Kiểm thử và build

### Unit test và kiểm tra mã nguồn

Chạy sau khi đã `npm ci` trong từng ứng dụng:

```powershell
cd backend
npm run lint
npm test
npm run build
cd ../frontend
npm run lint
npm test
npm run build
```

Backend tự generate Prisma Client trước `test` và `build`. Frontend production build dùng Webpack. Kết quả test in ra terminal; `npm run test:cov` trong backend tạo báo cáo coverage.

### API/E2E và kiểm thử PostgreSQL

Dùng database riêng có tên kết thúc bằng `_test`; tạo database đó trước. Không dùng database demo hoặc dữ liệu thật vì bài test có ghi dữ liệu.

Tại thư mục `backend`, sau khi cài thư viện:

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres:YOUR_PASSWORD@localhost:5432/brewlite_a1_test?schema=public'
$env:DATABASE_URL=$env:TEST_DATABASE_URL
$env:JWT_SECRET='local-test-secret-change-before-real-use'
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
npm run test:e2e
npm run test:database
```

Thay mật khẩu/cổng cho đúng máy. Seed trước E2E để có sản phẩm mẫu. Bộ E2E gồm cả bài dùng mock và bài dùng database thật; không thay thế hoàn toàn kiểm thử giao diện. Sau khi test, đóng terminal này để không dùng nhầm biến môi trường test khi chạy ứng dụng.

| Loại test | Vị trí |
|---|---|
| Backend unit | `backend/src/**/*.spec.ts` |
| API/E2E | `backend/test/*.e2e-spec.ts` |
| PostgreSQL integration | `backend/test/*.database-test.ts` |
| Frontend unit | `frontend/src/services/*.spec.ts`, `frontend/src/stores/*.spec.ts` |

Các test T10 kiểm tra chuyển trạng thái sai, thanh toán lặp, tồn kho/đồng thời và hủy đơn hoàn kho một lần. Giữ các test và migration trong mã nguồn bàn giao.

## 8. Kết quả kiểm tra

### Kiểm tra trên main ngày 02/11/2026

Bản mã nguồn được kiểm tra: commit `fe832a5` (đã merge T10 qua PR #35). Các thay đổi dọn README và xóa ảnh mẫu sau đó chưa được commit.

| Bộ kiểm tra | Kết quả xác nhận |
|---|---|
| Backend unit — `npm test` | 82/82 test đạt, 14 file test |
| Frontend unit — `npm test` | 30/30 test đạt, 6 file test |
| Backend lint — `npm run lint` | Đạt |
| Frontend lint — `npm run lint` | Đạt |
| Backend build — `npm run build` | Đạt |
| Frontend production build — `npm run build` | Đạt, dùng Webpack |
| Kiểm tra khoảng trắng — `git diff --check` | Đạt tại thời điểm cập nhật README |

Bảng kiểm tra main ở trên chỉ ghi nhận unit test, lint và build. Kết quả E2E/PostgreSQL lịch sử nằm ở phần dưới; báo cáo kiểm thử bàn giao mới được tổng hợp tại comment GitHub. Chưa thực hiện demo thao tác đầy đủ trên trình duyệt hoặc đo thời gian phản hồi API theo tiêu chí hiệu năng.

### Kết quả theo từng task T01–T10

Bảng dưới tổng hợp kết quả đã ghi trong README trước khi rút gọn. Ngày là thời điểm kiểm tra từng task; số test là số được ghi nhận lúc đó, không cộng dồn và không đại diện cho số test hiện tại. Kết quả chạy lại trên main được ghi riêng ở bảng phía trên.

| Task | Ngày kiểm tra | Nội dung và kết quả đã ghi nhận |
|---|---|---|
| T01 — Khởi tạo | 14/10/2026 | Frontend HTTP 200, hiển thị trang chào; backend `GET /` trả `Hello World!`; CORS đúng origin. Lint, build, backend unit/E2E đạt. |
| T02 — Products API | 15/10/2026 | Migration/seed Product hoạt động; danh sách và chi tiết trả đủ dữ liệu; ID sai định dạng trả 400, ID không tồn tại trả 404. E2E 5/5; backend lint/build đạt. |
| T03 — Menu | 16/10/2026 | Menu lấy dữ liệu API thật; đã kiểm tra loading, rỗng, lỗi kết nối, hết hàng và ảnh lỗi. Kiểm tra giao diện tại 375/768/1024/1440 px; lint/build đạt tại thời điểm đó. |
| T04 — Chi tiết món | 18/10/2026 | Route chi tiết hiển thị dữ liệu API; chọn S/M/L và topping cập nhật giá; xử lý ID sai hoặc món không tồn tại. Frontend lint/build đạt. |
| T05 — Giỏ hàng | 20/10/2026 | Thêm, đổi số lượng, xóa, gộp dòng cùng lựa chọn, badge và tổng tiền được kiểm tra; giỏ rỗng/giới hạn tồn hoạt động. Cart store 4/4 test; lint/build đạt. |
| T06 — Tạo đơn | 23/10/2026 | `POST /orders` kiểm tra giỏ, sản phẩm/tồn kho, tính giá ở backend và lưu Order/OrderItem PENDING. Ghi nhận unit/DTO test đạt và E2E 7/7; lint/build/schema validation đạt. Một phần test T06 lúc đó được lưu riêng cục bộ; các con số này là lịch sử, không khẳng định toàn bộ test cũ còn trong repo. |
| T07 — Xác thực | 30/10/2026 | Kiểm tra lại trên main `bb86eab`: backend unit 16/16, API test 15/15, Auth store 9/9. Đăng ký/đăng nhập, bcrypt, JWT, validation và guard tạo đơn đạt; bộ API dùng Prisma mock. |
| T08 — Thanh toán | 28/10/2026 | Đã kiểm tra checkout với PostgreSQL thật: thành công xóa giỏ, thất bại giữ giỏ, retry dùng cùng mã đơn; sửa giỏ sau lỗi tạo đơn mới. Backend unit 22/22, E2E 27/27; frontend unit 20/20; lint/build đạt. Đây là số của các bộ test lúc đó. |
| T09 — Xác nhận và Docker | 01/11/2026 | Compose build được, PostgreSQL/API healthy; xác nhận đúng mã/tổng tiền sau PAID, tải lại và lịch sử đúng; thất bại rồi retry không tạo thêm đơn. Kiểm tra Chrome headless cùng API/PostgreSQL thật; dữ liệu giữ qua restart. Backend unit 29/29, frontend unit 24/24 tại thời điểm đó. |
| T10 — Backend nâng cao | 01–02/11/2026 | Bản tích hợp `16594da` đã ghi nhận kiểm tra state machine, idempotency, tranh kho/rollback, khuyến mãi/điểm; E2E 44/44, PostgreSQL 16/16 (7 T10B + 9 nhân viên). Main `fe832a5` ngày 02/11 đạt backend unit 82/82, frontend unit 30/30 và lint/build; kết quả E2E/PostgreSQL lịch sử được ghi riêng bên dưới. |

Các thay đổi sau mốc kiểm tra từng task (như nhiều phần topping, chặn vượt kho từ giỏ và hủy PAID hoàn kho) cần được kiểm tra trong đợt demo tích hợp cuối. Bảng này không thay thế kết quả nghiệm thu của giảng viên.
### Kết quả tích hợp đã ghi nhận trước đó

Theo bản README trước khi rút gọn, ngày 01/11/2026 trên nhánh `task-10/backend-logic`, commit `16594da`:

| Bộ kiểm tra | Kết quả đã ghi nhận |
|---|---|
| Backend E2E | 44/44 đạt; gồm bài dùng mock và bài PostgreSQL T10A |
| PostgreSQL integration | 16/16 đạt: 7 T10B và 9 phần nhân viên |
| Migration trên database thử | `prisma migrate deploy` đạt |

Đây là kết quả lịch sử của bản mã nguồn nêu trên, chưa phải kết quả chạy lại trên main hiện tại. Khi kiểm thử bàn giao, cập nhật ngày, commit, kết quả thực tế và lỗi còn tồn tại vào mục này.

## 9. Checklist demo và bàn giao A1

- [ ] Khởi động được PostgreSQL, API và web bằng Compose.
- [ ] Menu tải dữ liệu; mở món, đổi size/topping và kiểm tra giá.
- [ ] Thêm giỏ, đổi số lượng, chỉnh sửa món, xóa và kiểm tra tổng tiền.
- [ ] Đăng ký/đăng nhập; tạo đơn và thanh toán thành công, nút thanh toán hiện tổng tiền.
- [ ] Trang xác nhận hiển thị mã/trạng thái; tải lại và kiểm tra lịch sử đơn.
- [ ] Mô phỏng thanh toán thất bại: giữ giỏ, thử lại thành công.
- [ ] Kiểm tra khuyến mãi, điểm thưởng, thiếu kho và các trường hợp T10 bằng test.
- [ ] Chuẩn bị mã nguồn Git, Compose, README và kết quả kiểm thử thực tế.
- [ ] Sprint Review/Demo với giảng viên, trình bày Retrospective và ghi nhận phản hồi cho backlog.

Checklist là nội dung cần kiểm tra khi bàn giao, không phải xác nhận mọi mục đã được nghiệm thu. Thanh toán thật và các tài liệu thiết kế thuộc Assignment 2 không nằm trong hướng dẫn chạy A1 này.
