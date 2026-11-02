import type { Metadata } from "next";
import "./globals.css";
import { Suspense } from "react";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "BrewLite - Thực đơn Cà phê & Đồ uống",
  description: "Đặt và thanh toán đồ uống không dùng tiền mặt tại BrewLite.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="flex min-h-screen w-full flex-col bg-[#faf7f2] text-stone-900 antialiased">
        <Suspense fallback={<p className="p-8">Đang mở BrewLite…</p>}>
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
