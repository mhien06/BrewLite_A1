"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Header from "./Header";
import StaffHeader from "./StaffHeader";
import { useAuthStore } from "@/stores/auth.store";

// Chọn giao diện theo tài khoản và đường dẫn. API vẫn kiểm tra quyền riêng.
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const initialize = useAuthStore((state) => state.initialize);
  const staffPage = pathname === "/staff" || pathname.startsWith("/staff/");
  const staffAccount = user?.role === "STAFF";

  useEffect(() => {
    void initialize();
  }, [initialize]);
  useEffect(() => {
    if (staffAccount && !staffPage) router.replace("/staff");
  }, [staffAccount, staffPage, router]);

  const staffView = staffPage || staffAccount;
  return (
    <>
      {staffView ? <StaffHeader /> : <Header />}
      <div className="w-full min-w-0 flex-1">
        {staffAccount && !staffPage ? (
          <p className="p-8" role="status">
            Đang mở quầy nhân viên…
          </p>
        ) : (
          children
        )}
      </div>
      <footer className="mt-12 border-t border-stone-200 px-4 py-6 text-center text-xs text-stone-500">
        © 2026 BrewLite.{" "}
        {staffView
          ? "Khu vực quản lý quầy."
          : "Đặt và thanh toán đồ uống không dùng tiền mặt."}
      </footer>
    </>
  );
}
