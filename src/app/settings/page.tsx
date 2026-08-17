'use client';

import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  ShieldCheck, 
  History, 
  User, 
  Store, 
  Database,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '@/components/AuthContext';

export default function SettingsPage() {
  const { user } = useAuth();
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  const loadAuditLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch('/api/audit-logs?limit=50');
      const json = await res.json();
      if (json.success) {
        setAuditLogs(json.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'ADMIN') {
      loadAuditLogs();
    }
  }, [user]);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>
        {/* Left Column: System & Store Info */}
        <div>
          <div className="card">
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Store size={16} color="#2563eb" />
                <h2 className="card-title" style={{ fontSize: 15 }}>Thông tin cửa hàng</h2>
              </div>
            </div>
            <div className="card-body" style={{ fontSize: 13 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: '#64748b', fontSize: 12 }}>Tên hệ thống:</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>T_SHOP RETAIL MANAGEMENT</div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: '#64748b', fontSize: 12 }}>Mô hình kinh doanh:</div>
                <div style={{ fontWeight: 600 }}>Cửa hàng đồ chơi trẻ em</div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: '#64748b', fontSize: 12 }}>Cơ chế tính giá & doanh thu:</div>
                <div style={{ fontWeight: 600, color: '#16a34a' }}>Snapshot Transaction (Bất biến lịch sử)</div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: '#64748b', fontSize: 12 }}>Database Engine:</div>
                <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>SQLite 3.x (WAL Mode + ACID)</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={16} color="#059669" />
                <h2 className="card-title" style={{ fontSize: 15 }}>Tài khoản đang đăng nhập</h2>
              </div>
            </div>
            <div className="card-body" style={{ fontSize: 13 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: '#64748b', fontSize: 12 }}>Họ và tên:</div>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>{user?.full_name}</div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: '#64748b', fontSize: 12 }}>Tên đăng nhập:</div>
                <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{user?.username}</div>
              </div>
              <div>
                <div style={{ color: '#64748b', fontSize: 12 }}>Vai trò / Phân quyền:</div>
                <span className="badge badge-success" style={{ marginTop: 4 }}>{user?.role}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Audit Logs */}
        <div>
          <div className="card">
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <History size={16} color="#2563eb" />
                <h2 className="card-title" style={{ fontSize: 15 }}>Nhật ký kiểm toán hệ thống (Audit Logs)</h2>
              </div>

              <button onClick={loadAuditLogs} className="btn btn-secondary btn-sm">
                <RefreshCw size={13} className={loadingLogs ? 'animate-spin' : ''} />
                <span>Làm mới</span>
              </button>
            </div>

            <div className="table-container" style={{ maxHeight: 600 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Người thực hiện</th>
                    <th>Hành động</th>
                    <th>Đối tượng</th>
                    <th>Chi tiết thay đổi</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingLogs ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '24px 0', color: '#64748b' }}>
                        Đang tải nhật ký...
                      </td>
                    </tr>
                  ) : auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8' }}>
                        Chưa có dữ liệu nhật ký.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
                          {log.created_at}
                        </td>
                        <td style={{ fontWeight: 600, fontSize: 12.5 }}>
                          {log.user_name || 'Hệ thống'}
                        </td>
                        <td>
                          <span className="badge badge-neutral" style={{ fontSize: 11 }}>
                            {log.action}
                          </span>
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {log.entity_name} #{log.entity_id || ''}
                        </td>
                        <td style={{ fontSize: 11.5, fontFamily: 'monospace', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.new_value_json || log.old_value_json}>
                          {log.new_value_json || log.old_value_json || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
