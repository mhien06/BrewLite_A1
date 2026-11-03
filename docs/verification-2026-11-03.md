# Verification — 03/11/2026

Baseline: main `ddb3013`. Input validation fix: `901bbe9`. Build network configuration: `f590434`.

## Scope

Sửa invalid database ID gây HTTP 500; cập nhật README và xác nhận Docker build/runtime. Không thay đổi payment flow, state machine, stock logic, dependency versions hoặc database schema. Minh chứng Scrum và nghiệm thu cuối được xử lý riêng; báo cáo này không xác nhận các hoạt động đó đã hoàn thành.

## Input validation

- Dùng `ParseDatabaseIdPipe` cho product/order/staff route params.
- Dùng `@Max(2147483647)` cho productId/orderId trong DTO. Inventory check-cart dùng chung item DTO nên được bảo vệ cùng lúc.
- ID phải là integer trong khoảng `1..2147483647`.
- Invalid ID trả HTTP 400 trước khi gọi service/Prisma. Valid ID không tồn tại vẫn trả HTTP 404.

HTTP regression test tại `backend/test/id-validation.e2e-spec.ts` có 58 case, kiểm tra số âm, zero, decimal, string sai định dạng, overflow, hai boundary hợp lệ và 404. Test dùng controller/pipe/DTO thật, service stub và guard override để kiểm tra validation độc lập. Các E2E/database test còn lại tiếp tục kiểm tra authentication và nghiệp vụ.

## Test results

| Check | Result |
|---|---|
| Backend unit test | 82/82, 14 file |
| Frontend unit test | 37/37, 8 file |
| Backend E2E test | 102/102, 8 file; gồm 58 regression case mới |
| Database integration test | 27/27, 3 file |
| Tổng bốn test suite | 248/248 |
| Backend/frontend lint | PASS |
| Backend/frontend build | PASS; frontend Webpack |
| Compose config | PASS với BUILD_NETWORK=default và host; vẫn ba service, không đổi runtime network |

Chạy tại từng thư mục ứng dụng:

```powershell
npm run lint
npm test
npm run build
```

Chạy tại `backend`, cấu hình `DATABASE_URL` và `TEST_DATABASE_URL` trỏ tới PostgreSQL test riêng trước khi chạy các test có database:

```powershell
npm run prisma:deploy
npm run prisma:seed
npm run test:e2e
npm run test:database
```

## Docker và runtime

Backend image build đã PASS với Dockerfile của PR. Bước install chạy `npm ci` trên filesystem chưa có node_modules; lần đầu bị ECONNRESET, lần thứ hai dùng download cache trong cùng build step và cài thành công 466 package. Prisma generate và Nest build đều PASS. Không COPY node_modules từ máy host hay dùng dependency image làm bản xác nhận cuối; base image/OS build layer có sử dụng Docker cache.

Frontend image build PASS bằng Dockerfile hiện tại, có sử dụng build cache; frontend source và dependency versions không thay đổi trong PR này.

Compose gốc khởi động ba service từ các image vừa build: PostgreSQL/API healthy, web Up. Kiểm tra trên project/database/volume và port riêng, không dùng database demo của người dùng:

| Runtime check | Result |
|---|---|
| Migration khi khởi động API | PASS |
| HTTP smoke test, gồm 5 overflow regression check | 35/35 |
| Chrome UI với API/PostgreSQL thật | 21/21 |
| Install retry control: thành công ngay / thành công lần 3 / thất bại cả 3 | PASS; trường hợp cuối giữ exit code 1 |

UI check gồm đăng ký/đăng nhập, menu và ảnh, size/topping, cart/badge/tổng tiền, payment failure giữ cart, retry cùng order, success xóa cart, confirmation sau reload và order history. Kiểm tra menu tại viewport 375/768/1440 px, cart mobile không có horizontal overflow và không phát sinh uncaught browser error.

Build network `host` đã giúp bước apt-get hoàn tất trên môi trường kiểm tra. Compose cho phép chọn bằng BUILD_NETWORK nhưng giữ mặc định `default`, không chuyển runtime container sang host network. Npm install retry tối đa 3 lần; không bỏ qua lỗi nếu tất cả lần thử đều thất bại.

Hai image được build bằng các lệnh tương đương dưới đây (tag/project và port của môi trường audit được đặt riêng):

```powershell
docker build --network=host --progress=plain -t brewlite-a1-fix-20261103-api -f backend/Dockerfile backend
docker compose -p brewlite-a1-fix-20261103 --env-file <audit-env-file> build web
docker compose -p brewlite-a1-fix-20261103 --env-file <audit-env-file> up --no-build -d
```

`<audit-env-file>` là placeholder cho file local của người chạy, không phải file secret được bàn giao trong repository. Script/config riêng để tái kiểm tra từ đầu đã có trong README và .env.example.

## Giới hạn

- Performance audit trước bản sửa trên main `ddb3013`: 300 request/10 endpoint, concurrency 1, max response time 72,74 ms; không phải load test.
- Chrome UI check không xác nhận mọi browser.
- Checklist Sprint Review, Sprint Retrospective và bàn giao vẫn chưa được đánh dấu hoàn thành.
- `npm audit` backend còn 2 moderate finding liên quan devDependency `@nestjs/cli` và dependency `minimatch`. Không tự chạy audit fix --force vì gợi ý hiện tại thay đổi major version của CLI; dependency review được ghi riêng, không đổi versions trong PR này.
