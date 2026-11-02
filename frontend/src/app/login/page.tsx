"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const isLoading = useAuthStore((state) => state.isLoading);
  const storeError = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    clearError();

    const handleLogout = () => {
      setEmail("");
      setPassword("");
      setLocalError(null);
      clearError();
    };

    window.addEventListener("brewlite:logout", handleLogout);
    return () => {
      window.removeEventListener("brewlite:logout", handleLogout);
      clearError();
    };
  }, [clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!email.trim()) {
      setLocalError("Vui lòng nhập email.");
      return;
    }
    if (!password) {
      setLocalError("Vui lòng nhập mật khẩu.");
      return;
    }

    const success = await login(email.trim(), password);
    if (success) {
      const user = useAuthStore.getState().user;
      router.replace(user?.role === "STAFF" ? "/staff" : "/");
    }
  };

  const errorMessage = localError || storeError;

  return (
    <main className="mx-auto flex min-h-[calc(100vh-140px)] w-full max-w-md flex-col justify-center px-4 py-12 sm:px-6">
      <div className="rounded-3xl border border-[#ead8c7] bg-white p-6 shadow-xl shadow-amber-950/5 sm:p-8">
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-amber-700 via-amber-800 to-amber-950 text-amber-100 shadow-md shadow-amber-950/20 ring-1 ring-amber-600/30"
          >
            <svg
              className="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
              <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
              <line x1="6" y1="2" x2="6" y2="4" />
              <line x1="10" y1="2" x2="10" y2="4" />
              <line x1="14" y1="2" x2="14" y2="4" />
            </svg>
          </Link>
          <h1 className="mt-4 text-2xl font-extrabold text-[#40241b] sm:text-3xl">
            Đăng nhập BrewLite
          </h1>
          <p className="mt-1 text-sm text-[#9a7c6b]">
            Khách hàng mua đồ uống · Nhân viên quản lý quầy
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700"
          >
            {errorMessage}
          </div>
        )}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-bold uppercase tracking-wider text-[#7a3b22]"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ten@example.com"
              className="mt-1.5 w-full rounded-xl border border-[#ead8c7] bg-white px-4 py-2.5 text-sm text-[#40241b] transition focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-bold uppercase tracking-wider text-[#7a3b22]"
            >
              Mật khẩu
            </label>
            <div className="relative mt-1.5">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-[#ead8c7] bg-white px-4 py-2.5 pr-12 text-sm text-[#40241b] transition focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-3 inline-flex items-center text-[#9a7c6b] hover:text-[#40241b]"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {showPassword ? (
                    <>
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                      <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 9 5 9 7a9.7 9.7 0 0 1-2.1 3.1" />
                      <path d="M6.2 6.2C4.2 7.5 3 9.5 3 12c0 2 4 7 9 7 1 0 2-.2 2.9-.6" />
                    </>
                  ) : (
                    <>
                      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 flex w-full items-center justify-center rounded-full bg-[#f6a14a] px-6 py-3 text-sm font-bold text-[#40241b] transition hover:bg-[#f29435] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <span className="inline-flex items-center gap-2">
                <svg
                  className="h-4 w-4 animate-spin text-[#40241b]"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                Đang xử lý...
              </span>
            ) : (
              "Đăng nhập"
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-[#9a7c6b]">
          Chưa có tài khoản?{" "}
          <Link
            href="/register"
            className="font-bold text-[#7a3b22] hover:underline"
          >
            Đăng ký ngay
          </Link>
        </div>

        <div className="mt-4 border-t border-[#ead8c7]/60 pt-4 text-center">
          <Link
            href="/"
            className="text-xs font-semibold text-[#9a7c6b] hover:text-[#40241b]"
          >
            ← Về lại Thực đơn
          </Link>
        </div>
      </div>
    </main>
  );
}
