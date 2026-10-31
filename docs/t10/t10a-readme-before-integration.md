# Hướng dẫn T10A của Khoa


## Backend T10A - Trạng thái đơn, khuyến mãi và điểm thưởng

State Machine chỉ cho phép các chuyển trạng thái sau:

```text
PENDING       → PAID | PAYMENT_FAILED | CANCELLED
PAYMENT_FAILED → PAID | PAYMENT_FAILED | PENDING | CANCELLED
PAID          → PREPARING | CANCELLED
PREPARING     → READY | CANCELLED
READY         → COMPLETED
COMPLETED, CANCELLED: trạng thái kết thúc
```

Tạo đơn vẫn gửi `items` như T06; có thể thêm `promotionCode`. Backend lấy giá sản phẩm và tự tính `subtotal`, `discountAmount`, `total`, không nhận tiền do client tự tính:

```json
{
  "items": [{ "productId": 1, "size": "M", "quantity": 2, "toppings": ["pearls"] }],
  "promotionCode": "BREW10"
}
```

Response giữ các trường cũ và bổ sung `promotionCode`, `subtotal`, `discountAmount`. Ví dụ subtotal `84.000đ`, mã `BREW10` giảm `8.400đ`, `total` còn `75.600đ`. `BREW10` giảm 10% (đơn từ `50.000đ`, tối đa `20.000đ`); `GIAM15K` giảm `15.000đ` (đơn từ `60.000đ`). Chạy `cd backend; npm run prisma:seed` để upsert hai mã mẫu.

Ví dụ response (các trường khác như `id`, `userId`, `status`, `createdAt`, `items` vẫn được giữ):

```json
{
  "id": 101,
  "userId": 7,
  "status": "PENDING",
  "promotionCode": "BREW10",
  "subtotal": 84000,
  "discountAmount": 8400,
  "total": 75600
}
```

Khi thanh toán thành công, điểm được cộng bằng `floor(total / 10.000)` trên số tiền sau giảm giá; thanh toán lỗi không cộng điểm. Mỗi đơn chỉ ghi nhận một lần. Chạy kiểm thử backend bằng `npm run prisma:generate`, `npm run lint`, `npm run build`, `npm test` và `npm run test:e2e` trong `backend`.
