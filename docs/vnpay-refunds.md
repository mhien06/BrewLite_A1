# VNPay Sandbox refund flow

## Scope

BrewLite creates one full-refund request for a paid VNPay payment when:
- A staff member cancels a paid order before preparation.
- A customer cancels a paid order while cancellation is allowed.
- VNPay confirms a payment after the order has expired or already been cancelled.
- VNPay confirms a payment but the order cannot be fulfilled because stock is insufficient.

Wallet and simulated-card payments are not sent to VNPay.

## Refund state machine

| State | Meaning |
| --- | --- |
| `PENDING` | Refund is queued and has not been sent yet. |
| `PROCESSING` | A worker claimed the refund and is calling VNPay or checking its result. |
| `SUCCEEDED` | A verified VNPay refund response confirms transaction type `02` and transaction status `00`. |
| `FAILED` | VNPay explicitly rejected the request. Staff may retry this state. |
| `NEEDS_REVIEW` | The outcome is ambiguous. The worker performs QueryDR reconciliation and never blindly resends the refund. |

An HTTP success or an accepted request is not sufficient to set `SUCCEEDED`.
A QueryDR result describing only the original payment (transaction type `01`) is not proof of a refund.
VNPay response code `94` means a duplicate refund request is already being processed, so it is reconciled rather than retried. Transaction status `05`/`06` remains in review while VNPay processes the refund; status `09` is an explicit refund rejection and can become `FAILED`.
An ambiguous timeout or response code `99` is not automatically retried because VNPay may already have processed the refund.

## Database and audit history

Migrations:
- `backend/prisma/migrations/20261111000000_restore_vnpay_refunds/migration.sql`
- `backend/prisma/migrations/20261111190000_refund_entities_and_attempt_history/migration.sql`

The original `Payment` remains the immutable record of the successful charge. A dedicated `Refund` row is linked 1:1 to its source `Payment` and to the `Order`. Its unique `paymentId` prevents more than one full-refund lifecycle for the same charge. It stores amount, reason, requester, current status, request ID and lifecycle timestamps.

Every outbound Refund request and every QueryDR reconciliation is stored as a separate `RefundAttempt`. Each attempt has a monotonically increasing attempt number, unique request ID, type, state, original transaction reference/date, amount, sanitized VNPay response metadata and error details. The signed request payload and hash secret are never stored. A rejected retry creates a new attempt and never overwrites earlier evidence.

The second migration backfills existing Payment-level refund metadata into `Refund` and a legacy attempt where possible, then removes the temporary refund columns from `Payment`. It is additive with respect to the new tables and does not reset or truncate the database.

Apply through the project's normal Prisma migration deployment process after reviewing and backing up the target database.

## Environment

Copy the VNPay placeholders from `backend/.env.example` into the backend environment and replace them with credentials issued for the merchant. Never commit real credentials.

- `VNPAY_TMN_CODE`: merchant terminal code.
- `VNPAY_HASH_SECRET`: merchant signing secret.
- `VNPAY_RETURN_URL`: public API return URL configured in VNPay.
- `VNPAY_API_URL`: Sandbox transaction API endpoint.
- `VNPAY_SERVER_IP`: public IP of the server that calls VNPay when deployed.

The Sandbox merchant must be explicitly enabled for the Refund API. A payment integration credential alone does not prove refund permission.

## Staff operations

The staff order page shows the Refund record, current state, amount, reason, completion timestamp, and the ten most recent Refund/QueryDR attempts with response metadata and the user/system that initiated each attempt.
Only a refund in `FAILED` can be submitted again through the staff retry endpoint. `NEEDS_REVIEW` is intentionally not retryable from the UI: reconcile it with VNPay/merchant support first to avoid a duplicate refund.

## Validation

Automated tests cover:
- Full refund success requires a verified VNPay refund response.
- Ambiguous response moves to `NEEDS_REVIEW`.
- QueryDR of the original payment does not falsely mark a refund successful.
- Explicit rejection becomes `FAILED` and the staff retry path creates a new request ID.
- A competing worker cannot claim the same request twice.
- Paid VNPay order cancellation queues a refund in the same database transaction.
- A late successful VNPay callback for a cancelled order queues a refund.
- The maintenance loop processes expiry and refund reconciliation.

The CI workflow runs Prisma migration deployment against PostgreSQL, backend unit/E2E/database integration tests, lint and build, plus frontend tests, lint and build.

## Sandbox evidence and remaining external check

No live Refund API request is made as part of GitHub source editing. After deployment to a reachable Sandbox callback environment, perform one low-value test payment, cancel the paid order as staff, and capture:
1. The original VNPay transaction reference and transaction number (mask personal data).
2. The outgoing Refund request metadata without the hash secret.
3. VNPay's signed Refund response with transaction type `02`, response code `00`, and transaction status `00`.
4. The BrewLite Refund record showing `SUCCEEDED` and its corresponding confirmed RefundAttempt.

If the merchant returns `99` or denies Refund permission, leave the payment in `NEEDS_REVIEW`, attach the masked response and merchant-support confirmation to the PR, and do not claim that a real Sandbox refund succeeded.

## VNPay transaction date

Refund and QueryDR requests must send `vnp_TransactionDate` equal to the original payment request's `vnp_CreateDate` (GMT+7), not the customer's `vnp_PayDate`. BrewLite builds the original payment URL from `Payment.createdAt`, so the refund worker reuses that persisted timestamp. Do not substitute `providerPayDate`, which is the time the customer completed payment.

Reference: [VNPay QueryDR and Refund API](https://sandbox.vnpayment.vn/apis/docs/truy-van-hoan-tien/querydr%26refund.html).


VNPay's official [QueryDR and Refund API specification](https://sandbox.vnpayment.vn/apis/docs/truy-van-hoan-tien/querydr%26refund.html) defines response code 94 as an already-submitted refund being processed, transaction status 05/06 as refund processing/forwarded to the bank, and status 09 as a rejected refund. The worker treats these states separately to avoid duplicate refunds.
