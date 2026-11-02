"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";

// Thanh đầu trang dành riêng cho quầy: không có giỏ hàng hay nút mua hàng.
export default function StaffHeader() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  function handleLogout() {
    logout();
    window.dispatchEvent(new Event("brewlite:logout"));
    router.replace("/login");
  }

  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <Link href="/staff" className="text-xl font-bold text-amber-900">
          BrewLite{" "}
          <span className="text-sm font-normal text-stone-600">
            · Quầy nhân viên
          </span>
        </Link>
        {user ? (
          <div className="flex items-center gap-4">
            <span className="text-sm text-stone-700">{user.name}</span>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm"
            >
              Đăng xuất
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm"
          >
            Đăng nhập
          </Link>
        )}
      </div>
    </header>
  );
}
