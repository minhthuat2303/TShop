'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthContext';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  Package, 
  Boxes, 
  BarChart3, 
  Settings,
  Store,
  ShieldCheck,
  User as UserIcon,
  LogOut
} from 'lucide-react';

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { title: 'Tổng quan', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Ghi nhận bán', href: '/sales/new', icon: ShoppingCart },
  { title: 'Sản phẩm', href: '/products', icon: Package },
  { title: 'Quản lý kho', href: '/inventory', icon: Boxes },
  { title: 'Báo cáo', href: '/reports', icon: BarChart3 },
  { title: 'Cài đặt', href: '/settings', icon: Settings, adminOnly: true },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  if (!user || pathname === '/login') return null;

  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div className="sidebar-brand">
        <Store size={18} color="#2563eb" />
        <span>T_SHOP RETAIL</span>
        <span className="sidebar-brand-badge">PRO</span>
      </div>

      {/* Main Navigation */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          if (item.adminOnly && user.role !== 'ADMIN') return null;
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={17} />
              <span>{item.title}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom-left Admin / User Account Card */}
      <div className="sidebar-footer" style={{
        padding: '10px 12px',
        borderTop: '1px solid var(--border-subtle)',
        backgroundColor: '#fafafa',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: user.role === 'ADMIN' ? '#0f172a' : '#f1f5f9',
              color: user.role === 'ADMIN' ? '#ffffff' : '#0f172a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              {user.role === 'ADMIN' ? <ShieldCheck size={16} /> : <UserIcon size={16} />}
            </div>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontWeight: 600,
                fontSize: 12.5,
                color: '#0f172a',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {user.full_name || user.username}
              </div>
              <div style={{
                fontSize: 11,
                color: user.role === 'ADMIN' ? '#1d4ed8' : '#64748b',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {user.role === 'ADMIN' ? 'Quản Trị Viên (Admin)' : 'Nhân viên (Staff)'}
              </div>
            </div>
          </div>

          <button
            onClick={() => logout()}
            className="btn btn-secondary btn-sm"
            title="Đăng xuất khỏi hệ thống"
            style={{
              padding: 0,
              height: 28,
              width: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              borderColor: '#e2e8f0',
              color: '#64748b',
              cursor: 'pointer',
            }}
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  );
}
