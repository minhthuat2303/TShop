'use client';

import React from 'react';
import { useAuth } from './AuthContext';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { PlusCircle, Menu } from 'lucide-react';

interface HeaderProps {
  onToggleNav?: () => void;
  isNavOpen?: boolean;
}

export default function Header({ onToggleNav }: HeaderProps) {
  const { user } = useAuth();
  const pathname = usePathname();

  if (!user || pathname === '/login') return null;

  const getPageTitle = () => {
    if (pathname.startsWith('/dashboard')) return 'Tổng quan kinh doanh';
    if (pathname.startsWith('/sales/new')) return 'Ghi nhận bán hàng';
    if (pathname.startsWith('/products')) return 'Sản phẩm & Danh mục';
    if (pathname.startsWith('/inventory/import')) return 'Nhập kho hàng hóa';
    if (pathname.startsWith('/inventory')) return 'Tồn kho & Thẻ kho';
    if (pathname.startsWith('/reports')) return 'Báo cáo & Phân tích';
    if (pathname.startsWith('/excel')) return 'Dữ liệu Excel';
    if (pathname.startsWith('/settings')) return 'Cài đặt hệ thống';
    return 'Quản lý Shop';
  };

  return (
    <header className="header">
      <div className="header-left">
        {/* Hamburger Menu Toggle Button (Visible on Mobile/Tablet) */}
        <button
          type="button"
          className="header-menu-btn"
          onClick={onToggleNav}
          aria-label="Mở menu điều hướng"
        >
          <Menu size={19} />
        </button>

        <div className="header-title">
          <span>{getPageTitle()}</span>
        </div>
      </div>

      <div className="header-actions">
        {pathname !== '/sales/new' && (
          <Link href="/sales/new" className="btn btn-primary btn-sm" title="Ghi nhận bán hàng nhanh">
            <PlusCircle size={15} />
            <span style={{ display: 'inline-block' }}>Bán nhanh</span>
          </Link>
        )}
      </div>
    </header>
  );
}
