'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import Header from './Header';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const pathname = usePathname();

  // Auto close mobile drawer whenever the user navigates to a new page
  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [pathname]);

  // Prevent background scrolling on mobile when sidebar drawer is open
  useEffect(() => {
    if (isMobileNavOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileNavOpen]);

  const toggleMobileNav = () => setIsMobileNavOpen((prev) => !prev);
  const closeMobileNav = () => setIsMobileNavOpen(false);

  const isLoginPage = pathname === '/login';

  return (
    <div className="app-container">
      {/* Mobile Drawer Backdrop */}
      {!isLoginPage && (
        <div
          className={`sidebar-backdrop ${isMobileNavOpen ? 'open' : ''}`}
          onClick={closeMobileNav}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar (Desktop fixed & Mobile drawer) */}
      <Sidebar isOpen={isMobileNavOpen} onClose={closeMobileNav} />

      {/* Main Content Area */}
      <div className={`main-content ${isLoginPage ? 'login-layout' : ''}`} style={isLoginPage ? { marginLeft: 0, width: '100%' } : undefined}>
        {!isLoginPage && <Header onToggleNav={toggleMobileNav} isNavOpen={isMobileNavOpen} />}
        <main className="page-body">{children}</main>
      </div>
    </div>
  );
}
