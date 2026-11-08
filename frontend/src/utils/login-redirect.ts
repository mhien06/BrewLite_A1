const CUSTOMER_HOME = "/";
const STAFF_HOME = "/staff";

const ALLOWED_PATHS = new Set([
  "/",
  "/cart",
  "/checkout",
  "/orders",
  "/order-confirmation",
  "/payment/vnpay-return",
]);

function isAllowedPath(pathname: string): boolean {
  return (
    ALLOWED_PATHS.has(pathname) || /^\/products\/[1-9]\d*$/.test(pathname)
  );
}

export function sanitizeNextPath(raw: string | null | undefined): string {
  if (!raw) return CUSTOMER_HOME;

  let decoded = raw.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    return CUSTOMER_HOME;
  }

  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.includes("://")
  ) {
    return CUSTOMER_HOME;
  }

  try {
    const url = new URL(decoded, "http://brewlite.local");
    if (url.username || url.password || url.host !== "brewlite.local") {
      return CUSTOMER_HOME;
    }
    if (!isAllowedPath(url.pathname)) return CUSTOMER_HOME;
    return `${url.pathname}${url.search}`;
  } catch {
    return CUSTOMER_HOME;
  }
}

export function loginHref(next?: string | null): string {
  const sanitized = sanitizeNextPath(next);
  if (sanitized === CUSTOMER_HOME) return "/login";
  return `/login?next=${encodeURIComponent(sanitized)}`;
}

export function registerHref(next?: string | null): string {
  const sanitized = sanitizeNextPath(next);
  if (sanitized === CUSTOMER_HOME) return "/register";
  return `/register?next=${encodeURIComponent(sanitized)}`;
}

export function resolvePostLoginPath(
  next: string | null | undefined,
  role?: string,
): string {
  if (role === "STAFF") return STAFF_HOME;
  return sanitizeNextPath(next);
}
