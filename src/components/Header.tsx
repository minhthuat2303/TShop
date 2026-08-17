'use client';

import React from 'react';
import { useAuth } from './AuthContext';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { PlusCircle } from 'lucide-react';

export default function Header() {
  const { user } = useAuth();
  const pathname = usePathname();

  if (!user || pathname === '/login') return null;

  const getPageTitle = () => {
    if (pathname.startsWith('/dashboard')) return 'Tổng quan kinh doanh';
    if (pathname.startsWith('/sales/new')) return 'Ghi nhận bán hàng';
    if (pathname.startsWith('/products')) return 'Quản lý danh mục & sản phẩm';
    if (pathname.startsWith('/inventory/import')) return 'Nhập kho hàng hóa';
    if (pathname.startsWith('/inventory')) return 'Quản lý tồn kho & thẻ kho';
    if (pathname.startsWith('/reports')) return 'Báo cáo & Phân tích';
    if (pathname.startsWith('/excel')) return 'Quản lý dữ liệu Excel';
    if (pathname.startsWith('/settings')) return 'Cài đặt hệ thống';
    return 'Hệ thống Quản lý Shop';
  };

  return (
    <header className="header">
      <div className="header-title">
        <span>{getPageTitle()}</span>
      </div>

      <div className="header-actions">
        {pathname !== '/sales/new' && (
          <Link href="/sales/new" className="btn btn-primary btn-sm">
            <PlusCircle size={15} />
            <span>Ghi nhận bán nhanh</span>
          </Link>
        )}
      </div>
    </header>
  );
}
