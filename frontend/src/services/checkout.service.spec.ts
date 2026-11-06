import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CheckoutServiceError,
  createOrderApi,
  createPaymentApi,
  createVnpayPaymentUrlApi,
} from "@/services/checkout.service";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkout service", () => {
  it("creates an order with JWT and cart items", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 10,
          userId: 1,
          status: "PENDING",
          total: 34_000,
          createdAt: "2026-10-28T00:00:00.000Z",
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createOrderApi("jwt-token", {
      items: [
        {
          productId: 1,
          size: "M",
          quantity: 1,
          toppings: [],
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/orders"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer jwt-token",
        }),
      }),
    );
  });

  it("sends the selected payment method and simulation result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 10,
          userId: 1,
          status: "PAID",
          paymentMethod: "CARD",
          total: 34_000,
          paidAt: "2026-10-28T00:00:00.000Z",
          createdAt: "2026-10-28T00:00:00.000Z",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createPaymentApi("jwt-token", {
      orderId: 10,
      method: "CARD",
      simulateSuccess: true,
    });

    const request = fetchMock.mock.calls[0][1];
    expect(JSON.parse(request.body)).toEqual({
      orderId: 10,
      method: "CARD",
      simulateSuccess: true,
    });
  });
  it("creates a VNPAY URL with JWT and idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          orderId: 10,
          paymentId: 20,
          txnRef: "BL123",
          amount: 34_000,
          status: "PENDING",
          paymentUrl: "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
          expiresAt: "2026-11-05T11:00:00.000Z",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createVnpayPaymentUrlApi(
      "jwt-token",
      {
        orderId: 10,
        locale: "vn",
      },
      " vnpay-key ",
    );

    const [url, request] = fetchMock.mock.calls[0];

    expect(url).toContain("/payments/vnpay/create-url");
    expect(request.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer jwt-token",
        "Idempotency-Key": "vnpay-key",
      }),
    );
    expect(JSON.parse(request.body)).toEqual({
      orderId: 10,
      locale: "vn",
    });
    expect(result.paymentUrl).toContain("sandbox.vnpayment.vn");
  });
  it("throws the backend error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ message: "Đơn hàng đã được thanh toán." }),
          {
            status: 409,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    await expect(
      createPaymentApi("jwt-token", {
        orderId: 10,
        method: "WALLET",
        simulateSuccess: true,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<CheckoutServiceError>>({
        message: "Đơn hàng đã được thanh toán.",
        status: 409,
      }),
    );
  });
});
