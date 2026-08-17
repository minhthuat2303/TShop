import './globals.css';
import type { Metadata } from 'next';
import { AuthProvider } from '@/components/AuthContext';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';

export const metadata: Metadata = {
  title: 'T_SHOP - Hệ Thống Quản Lý Shop Đồ Chơi',
  description: 'Website quản lý bán hàng, sản phẩm, kho và thống kê cho shop đồ chơi trẻ em',
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
          <div className="app-container">
            <Sidebar />
            <div className="main-content">
              <Header />
              <main className="page-body">{children}</main>
            </div>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
