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

      let data: any;
      try {
        const text = await res.text();
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (!res.ok || !data || !data.success) {
        setError(data?.error?.message || (res.status >= 500 ? 'Lỗi máy chủ (500 Server Error). Vui lòng thử lại sau.' : 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.'));
        return;
      }

      login(data.data.user, data.data.token);
    } catch (err: any) {
      setError(err.message || 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng.');
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
      minHeight: '85vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '12px',
      width: '100%',
    }}>
      <div style={{
        maxWidth: 400,
        width: '100%',
        backgroundColor: '#ffffff',
        border: '1px solid var(--border-subtle)',
        borderRadius: 12,
        padding: '24px 20px',
        boxShadow: 'var(--shadow-md)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            width: 48,
            height: 48,
            backgroundColor: '#eff6ff',
            borderRadius: 10,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 10,
            border: '1px solid #bfdbfe'
          }}>
            <Store size={26} color="#2563eb" />
          </div>
          <h1 style={{ fontSize: 19, fontWeight: 800, color: '#0f172a' }}>T_SHOP MANAGEMENT</h1>
          <p style={{ fontSize: 12.5, color: '#64748b', marginTop: 3 }}>Hệ thống quản lý bán hàng & kho đồ chơi</p>
        </div>

        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 6,
            color: '#dc2626',
            fontSize: 12.5,
            marginBottom: 16,
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label" htmlFor="username">Tên đăng nhập</label>
            <div style={{ position: 'relative' }}>
              <input
                id="username"
                type="text"
                className="form-input"
                style={{ paddingLeft: 34, height: 42 }}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin / staff"
                required
                autoFocus
              />
              <User size={16} color="#94a3b8" style={{ position: 'absolute', left: 10, top: 13 }} />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 18 }}>
            <label className="form-label" htmlFor="password">Mật khẩu</label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type="password"
                className="form-input"
                style={{ paddingLeft: 34, height: 42 }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mật khẩu"
                required
              />
              <Lock size={16} color="#94a3b8" style={{ position: 'absolute', left: 10, top: 13 }} />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ width: '100%', height: 44, fontSize: 14.5 }}
            disabled={loading}
          >
            {loading ? 'Đang xác thực...' : 'Đăng nhập hệ thống'}
            {!loading && <ArrowRight size={16} />}
          </button>
        </form>

        <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--border-subtle)', textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Tài khoản mẫu:</div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setDemoAccount('admin')}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 11.5 }}
            >
              Admin (admin)
            </button>
            <button
              type="button"
              onClick={() => setDemoAccount('staff')}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 11.5 }}
            >
              Staff (staff)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
