# VNPAY Sandbox handover — Issue #39

Ngày kiểm thử: 06/11/2026.

## Phạm vi backend

Các endpoint:

- `POST /payments/vnpay/create-url`
  - Yêu cầu JWT Customer.
  - Yêu cầu header `Idempotency-Key`.
  - Backend kiểm tra quyền sở hữu Order và lấy số tiền từ database.
- `GET /payments/vnpay/ipn`
  - Xác minh checksum, `txnRef`, số tiền và trạng thái.
  - Xử lý callback lặp theo hướng idempotent.
- `GET /payments/vnpay/return`
  - Xác minh dữ liệu VNPAY.
  - Chỉ chuyển hướng trình duyệt; Return không tự quyết định thanh toán thành công.

## Cấu hình

Không commit giá trị thật của `VNPAY_TMN_CODE` và
`VNPAY_HASH_SECRET`.

```env
VNPAY_TMN_CODE=
VNPAY_HASH_SECRET=
VNPAY_PAYMENT_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_API_URL=https://sandbox.vnpayment.vn/merchant_webapi/api/transaction
VNPAY_PAYMENT_EXPIRY_MINUTES=15
VNPAY_RETURN_URL=https://<public-domain>/payments/vnpay/return
```

````

IPN URL:

```text
https://<public-domain>/payments/vnpay/ipn
````

Chạy HTTPS public:

```powershell
ngrok http --domain=<assigned-domain>.ngrok-free.dev 3001
```

## Kết quả kiểm thử

- Thanh toán thành công: Order chuyển `PENDING -> PAID`.
- Khách hủy: Order chuyển `PAYMENT_FAILED`, `paidAt` trống.
- Thử lại cùng Order: tạo Payment mới và thanh toán thành công.
- Thẻ không đủ số dư: VNPAY Sandbox từ chối trên giao diện.
- IPN xác minh checksum, số tiền và chống callback lặp.

## QueryDR và Refund

QueryDR kết nối được VNPAY nhưng Sandbox trả:

```json
{ "vnp_ResponseCode": "99", "vnp_Message": "Unexpected error" }
```

Backend từ chối response không hợp lệ. Chưa gửi Refund thật vì QueryDR chưa
có kết quả xác minh được và Refund dùng cùng API. Hạng mục này chưa đánh dấu
hoàn tất, cần phối hợp VNPAY hoặc xử lý tiếp tại #40.

## Quality checks

- Backend: `116/116` tests pass.
- Lint: `0` warnings, `0` errors.
- Build: pass.

## Bàn giao #40

#39 xác thực kết quả cổng thanh toán. #40 xử lý hết hạn/hủy Order, tồn kho,
điểm và quyết định khi nào yêu cầu hoàn tiền.
