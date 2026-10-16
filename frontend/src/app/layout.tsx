import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/Header';

export const metadata: Metadata = {
  title: 'BrewLite - Thực đơn Cà phê & Đồ uống',
  description: 'Đặt và thanh toán đồ uống không dùng tiền mặt tại BrewLite.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="flex min-h-screen w-full flex-col bg-[#faf7f2] text-stone-900 antialiased">
        <Header />
        <div className="flex-1 w-full min-w-0">{children}</div>
        <footer className="mt-12 border-t border-amber-900/10 bg-amber-100/30 px-4 py-6 text-center text-xs text-stone-500">
          <p>© 2026 BrewLite. Hệ thống đặt và thanh toán đồ uống không dùng tiền mặt.</p>
        </footer>
      </body>
    </html>
  );
}
