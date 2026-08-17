'use client';

import React, { useState } from 'react';
import { useAuth } from '@/components/AuthContext';
import { Store, Lock, User, AlertCircle, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error?.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.');
        return;
      }

      login(data.data.user, data.data.token);
    } catch (err: any) {
      setError(err.message || 'Không thể kết nối đến máy chủ. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const setDemoAccount = (role: 'admin' | 'staff') => {
    if (role === 'admin') {
      setUsername('admin');
      setPassword('admin123');
    } else {
      setUsername('staff');
      setPassword('staff123');
    }
  };

  return (
    <div style={{
      minHeight: '80vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        maxWidth: 420,
        width: '100%',
        backgroundColor: '#ffffff',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        padding: '32px 28px',
        boxShadow: 'var(--shadow-md)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 48,
            height: 48,
            backgroundColor: '#eff6ff',
            borderRadius: 8,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
            border: '1px solid #bfdbfe'
          }}>
            <Store size={26} color="#2563eb" />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>T_SHOP MANAGEMENT</h1>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Hệ thống quản lý bán hàng & kho đồ chơi</p>
        </div>

        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 6,
            color: '#dc2626',
            fontSize: 13,
            marginBottom: 18,
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="username">Tên đăng nhập</label>
            <div style={{ position: 'relative' }}>
              <input
                id="username"
                type="text"
                className="form-input"
                style={{ paddingLeft: 34 }}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin / staff"
                required
                autoFocus
              />
              <User size={16} color="#94a3b8" style={{ position: 'absolute', left: 10, top: 11 }} />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label" htmlFor="password">Mật khẩu</label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type="password"
                className="form-input"
                style={{ paddingLeft: 34 }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mật khẩu"
                required
              />
              <Lock size={16} color="#94a3b8" style={{ position: 'absolute', left: 10, top: 11 }} />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '10px 0', fontSize: 14 }}
            disabled={loading}
          >
            {loading ? 'Đang xác thực...' : 'Đăng nhập hệ thống'}
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>

        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border-subtle)', textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Tài khoản mặc định:</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => setDemoAccount('admin')}
              className="btn btn-secondary btn-sm"
            >
              Admin (admin / admin123)
            </button>
            <button
              type="button"
              onClick={() => setDemoAccount('staff')}
              className="btn btn-secondary btn-sm"
            >
              Staff (staff / staff123)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
