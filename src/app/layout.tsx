import './globals.css';
import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/components/AuthContext';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'T_SHOP - Hệ Thống Quản Lý Shop Đồ Chơi',
  description: 'Website quản lý bán hàng, sản phẩm, kho và thống kê cho shop đồ chơi trẻ em',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
