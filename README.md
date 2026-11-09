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

Nếu build bị chờ lâu ở `apt-get` hoặc `npm ci`, xem build log trước. Với Docker Engine hỗ trợ host build network, có thể thêm `BUILD_NETWORK=host` vào `.env` rồi chạy lại:

```powershell
docker compose build --no-cache
docker compose up --no-build -d
```

`BUILD_NETWORK` chỉ chọn network cho build, mặc định là `default`; không thay đổi runtime network, port hoặc database. Đặt lại `BUILD_NETWORK=default` khi không cần. Không đổi dependency versions chỉ để xử lý lỗi kết nối tải package.

Backend Docker build hiện fetch/install log của npm và thử lại `npm ci` tối đa 3 lần nếu install thất bại; download cache được giữ giữa các lần thử trong cùng build step. Nếu cả 3 lần đều lỗi, build vẫn dừng với exit code khác 0. Dependency versions tiếp tục lấy từ lockfile.

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
docker compose exec api npm run staff:role -- nhanvien@gmail.com STAFF
```

3. Đăng xuất rồi đăng nhập lại và vào `/staff`. Để quan sát đồng thời khách và nhân viên, dùng hai trình duyệt hoặc một cửa sổ thường và một cửa sổ ẩn danh.
4. Khi cần thu hồi quyền, thay `STAFF` bằng `CUSTOMER`.

Nếu chạy trực tiếp, dùng `npm run staff:role -- nhanvien@gmail.com STAFF` tại thư mục `backend`.

Nhân viên nhập/điều chỉnh kho kèm lý do, xem công thức và chuyển trạng thái đơn. Điểm thưởng chỉ được xem, không chỉnh thủ công.

## 6. Nghiệp vụ T10

- **Trạng thái:** `PENDING → PAID / PAYMENT_FAILED / CANCELLED`; `PAYMENT_FAILED → PENDING / CANCELLED`; `PAID → PREPARING / CANCELLED`; `PREPARING → READY`; `READY → COMPLETED`. `CANCELLED` và `COMPLETED` là trạng thái kết thúc.
- **Hủy đơn PAID:** trước khi pha, hoàn kho theo snapshot và thu hồi điểm trong transaction đúng một lần. Không hủy từ PREPARING. Đơn cũ thiếu snapshot trả lỗi để đối soát, không tự đoán lượng hoàn.
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

### Kiểm tra ngày 03/11/2026

Baseline: main `ddb3013`; bản sửa input validation: commit `901bbe9` trên nhánh `fix/a1-handover`. Các số dưới đây là kết quả chạy lại sau bản sửa, không cộng dồn kết quả lịch sử.

| Test suite / check | Kết quả |
|---|---|
| Backend unit test — `npm test` | 82/82, 14 test file |
| Frontend unit test — `npm test` | 37/37, 8 test file |
| Backend E2E test — `npm run test:e2e` | 102/102, 8 test file; gồm 58 HTTP regression test mới cho ID validation |
| Database integration test — `npm run test:database` | 27/27, 3 test file; PostgreSQL riêng |
| Tổng bốn test suite | 248/248 |
| Backend/frontend lint — `npm run lint` | Đạt |
| Backend/frontend build — `npm run build` | Đạt; frontend dùng Webpack |

ID trong route params và DTO phải là số nguyên từ `1` đến `2147483647`. Invalid ID trả HTTP 400; ID hợp lệ nhưng không tồn tại vẫn trả HTTP 404. Áp dụng cho products, orders, payments, inventory/check-cart và các route ID của staff. Không thay đổi payment flow, stock logic hay authorization.

Chạy riêng HTTP regression test tại `backend`:

```powershell
npx vitest run --config vitest.config.e2e.ts test/id-validation.e2e-spec.ts
```

Trên Docker runtime của bản sửa, HTTP smoke test đạt 35/35 và Chrome UI check đạt 21/21 với API/PostgreSQL thật. Đã kiểm tra đăng ký/đăng nhập, size/topping, cart, payment failure giữ cart, retry cùng order, confirmation sau reload và order history. Backend image đã cài dependency sạch bằng npm ci và build thành công; frontend image build đạt với build cache.

Performance audit trước bản sửa trên main `ddb3013`: 300 request trên 10 endpoint, concurrency 1, max response time 72,74 ms, tất cả dưới 500 ms. Đây là kết quả local với sample data, chưa phải load test hay xác nhận mọi browser.

Kết quả Docker clean build và runtime sau bản sửa đã được ghi nhận trong đợt kiểm tra ngày 03/11/2026. UI test và technical verification không thay thế Sprint Review/nghiệm thu; minh chứng Scrum và nghiệm thu cuối được hoàn thiện riêng.

### Kết quả lịch sử trên main ngày 02/11/2026

Commit `fe832a5`: backend unit test 82/82; frontend unit test 30/30; lint/build hai ứng dụng đạt. Giữ mốc này để truy vết; không dùng làm số liệu của phiên bản hiện tại.

### Kết quả theo từng task T01–T10

Bảng dưới tổng hợp kết quả đã ghi trong README trước khi rút gọn. Ngày là thời điểm kiểm tra từng task; số test là số được ghi nhận lúc đó, không cộng dồn và không đại diện cho số test hiện tại. Kết quả chạy lại trên bản sửa từ main được ghi riêng ở bảng phía trên.

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

Đây là kết quả lịch sử của commit nêu trên. Kết quả chạy lại ngày 03/11/2026 được ghi riêng phía trên và trong verification report.

## 9. Checklist demo và bàn giao A1

- [x] Khởi động được PostgreSQL, API và web bằng Compose.
- [x] Menu tải dữ liệu; mở món, đổi size/topping và kiểm tra giá.
- [x] Thêm giỏ, đổi số lượng, chỉnh sửa món, xóa và kiểm tra tổng tiền.
- [x] Đăng ký/đăng nhập; tạo đơn và thanh toán thành công, nút thanh toán hiện tổng tiền.
- [x] Trang xác nhận hiển thị mã/trạng thái; tải lại và kiểm tra lịch sử đơn.
- [x] Mô phỏng thanh toán thất bại: giữ giỏ, thử lại thành công.
- [x] Kiểm tra khuyến mãi, điểm thưởng, thiếu kho và các trường hợp T10 bằng test.
- [x] Chuẩn bị mã nguồn Git, Compose, README và kết quả kiểm thử thực tế.
- [ ] Sprint Review/Demo với giảng viên, trình bày Retrospective và ghi nhận phản hồi cho backlog.

Các mục đã tích là technical verification ngày 03/11/2026, không thay thế nghiệm thu với giảng viên. Sprint Review, Sprint Retrospective và minh chứng Scrum được hoàn thiện riêng. Dự án A1 mô phỏng thanh toán, không kết nối cổng thanh toán thật.

### Hủy và quá hạn đơn hàng

- API tự kiểm tra đơn quá hạn mỗi 30 giây và kiểm tra lại ngay khi khởi động. Không cần mở trình duyệt. Thời hạn mặc định 15 phút, cấu hình bằng `VNPAY_PAYMENT_EXPIRY_MINUTES`. Khi có giao dịch VNPAY, dùng thời hạn đã lưu của lần thử mới nhất; đơn chưa tạo giao dịch dùng thời gian tạo đơn. Sau hạn, không tạo lại URL cho đơn đó; khách đặt đơn mới.
- Khách hủy đơn chưa trả tiền của mình. Nhân viên hủy đơn PAID trước khi nhận pha, nhập lý do. Lưu người/nguồn hủy và thời gian; giữ chặn hủy từ PREPARING. Đơn chưa trừ kho không được hoàn kho.
- Tiền đến sau hủy/hết hạn hoặc không còn đủ nguyên liệu: giữ kết quả thu tiền ở Payment để đối soát thủ công, không cộng điểm hay phục vụ đơn. Hoàn kho và ghi nhận tiền thu là hai nghiệp vụ riêng; hệ thống không tự động hoàn tiền VNPAY.
- Khi đổi máy/tunnel, cập nhật Return URL trong `.env` và IPN trên VNPAY cùng về API đang chạy. Không commit `.env` hoặc thông tin merchant. Chạy lại `docker compose up --build -d`; API áp dụng migration mới khi khởi động.

Kiểm thử bổ sung có tại `backend/test/order-expiry.database-test.ts`: quá hạn, khởi động lại, callback trễ/lặp, hủy đồng thời, hoàn kho/điểm một lần, thiếu kho và rollback, tiền về sau hủy/hết hạn qua nhiều kết nối.
