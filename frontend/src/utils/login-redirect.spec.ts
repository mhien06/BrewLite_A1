import { describe, expect, it } from "vitest";
import {
  loginHref,
  registerHref,
  resolvePostLoginPath,
  sanitizeNextPath,
} from "./login-redirect";

describe("login redirect", () => {
  it("keeps allowed customer paths", () => {
    expect(sanitizeNextPath("/checkout")).toBe("/checkout");
    expect(sanitizeNextPath("/order-confirmation?orderId=12")).toBe(
      "/order-confirmation?orderId=12",
    );
  });

  it("rejects open redirects", () => {
    expect(sanitizeNextPath("https://evil.test")).toBe("/");
    expect(sanitizeNextPath("//evil.test")).toBe("/");
    expect(sanitizeNextPath("/staff")).toBe("/");
  });

  it("builds login and register links from a next path", () => {
    expect(loginHref("/checkout")).toBe("/login?next=%2Fcheckout");
    expect(registerHref("/cart")).toBe("/register?next=%2Fcart");
    expect(loginHref("/")).toBe("/login");
  });

  it("sends staff to the staff home after login", () => {
    expect(resolvePostLoginPath("/checkout", "STAFF")).toBe("/staff");
    expect(resolvePostLoginPath("/checkout", "CUSTOMER")).toBe("/checkout");
  });
});
