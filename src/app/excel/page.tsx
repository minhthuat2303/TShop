'use client';

import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  Download, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  FileCheck, 
  PlusCircle, 
  ArrowRight,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { useAuth } from '@/components/AuthContext';

export default function ExcelManagementPage() {
  const { user } = useAuth();
  const [selectedEntity, setSelectedEntity] = useState<'products' | 'categories' | 'product_types' | 'imports'>('products');
  const [file, setFile] = useState<File | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<any | null>(null);

  const [committing, setCommitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleDownloadTemplate = (type: string) => {
    window.open(`/api/excel/templates/${type}`, '_blank');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setPreviewData(null);
      setFeedback(null);
    }
  };

  // Upload and generate Preview Diff
  const handleGeneratePreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setPreviewing(true);
    setFeedback(null);
    setPreviewData(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', selectedEntity);

    try {
      const res = await fetch('/api/excel/preview', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setFeedback({ type: 'error', message: json.error?.message || 'Lỗi đọc và kiểm tra file Excel.' });
        return;
      }

      setPreviewData(json.data);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Lỗi kết nối máy chủ.' });
    } finally {
      setPreviewing(false);
    }
  };

  // Commit Previewed Data to database in transaction
  const handleCommitData = async () => {
    if (!previewData || committing) return;

    setCommitting(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/excel/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: previewData.fileName,
          entityType: previewData.entityType,
          creates: previewData.creates,
          updates: previewData.updates,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setFeedback({ type: 'error', message: json.error?.message || 'Lỗi cập nhật dữ liệu vào hệ thống.' });
        return;
      }

      setFeedback({ type: 'success', message: json.message || 'Cập nhật thành công!' });
      setPreviewData(null);
      setFile(null);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Lỗi kết nối hệ thống.' });
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* 1. Header & Download Templates Section */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div>
            <h1 className="card-title" style={{ fontSize: 18 }}>QUẢN LÝ NHẬP & CẬP NHẬT DỮ LIỆU EXCEL</h1>
            <p style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>
              Quy trình an toàn 3 bước: Tải mẫu $\rightarrow$ Xem Preview Diff $\rightarrow$ Xác nhận cập nhật
            </p>
          </div>
        </div>

        <div className="card-body">
          <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 10 }}>
            Bước 1: Tải file mẫu Excel chuẩn tiếng Việt
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <button
              onClick={() => handleDownloadTemplate('products')}
              className="btn btn-secondary"
              style={{ justifyContent: 'flex-start' }}
            >
              <Download size={16} color="#2563eb" />
              <span>Mẫu Sản phẩm (.xlsx)</span>
            </button>

            <button
              onClick={() => handleDownloadTemplate('categories')}
              className="btn btn-secondary"
              style={{ justifyContent: 'flex-start' }}
            >
              <Download size={16} color="#059669" />
              <span>Mẫu Danh mục (.xlsx)</span>
            </button>

            <button
              onClick={() => handleDownloadTemplate('product_types')}
              className="btn btn-secondary"
              style={{ justifyContent: 'flex-start' }}
            >
              <Download size={16} color="#7c3aed" />
              <span>Mẫu Loại sản phẩm (.xlsx)</span>
            </button>

            <button
              onClick={() => handleDownloadTemplate('imports')}
              className="btn btn-secondary"
              style={{ justifyContent: 'flex-start' }}
            >
              <Download size={16} color="#d97706" />
              <span>Mẫu Nhập kho (.xlsx)</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Upload & Validation Form */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 12 }}>
            Bước 2: Tải lên file Excel để kiểm tra tính hợp lệ & Xem trước thay đổi (Preview)
          </div>

          <form onSubmit={handleGeneratePreview}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 12, alignItems: 'center' }}>
              <select
                className="form-select"
                value={selectedEntity}
                onChange={(e) => setSelectedEntity(e.target.value as any)}
              >
                <option value="products">Sản phẩm</option>
                <option value="categories">Danh mục</option>
                <option value="product_types">Loại sản phẩm</option>
                <option value="imports">Nhập kho</option>
              </select>

              <input
                type="file"
                accept=".xlsx, .xls"
                className="form-input"
                onChange={handleFileChange}
                required
              />

              <button
                type="submit"
                className="btn btn-primary"
                disabled={!file || previewing}
                style={{ height: 38 }}
              >
                {previewing ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" />
                    <span>Đang kiểm tra...</span>
                  </>
                ) : (
                  <>
                    <FileCheck size={16} />
                    <span>Xem Preview Diff</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {feedback && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              backgroundColor: feedback.type === 'success' ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${feedback.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
              borderRadius: 6,
              color: feedback.type === 'success' ? '#15803d' : '#dc2626',
              marginTop: 14,
            }}>
              {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span style={{ fontWeight: 600 }}>{feedback.message}</span>
            </div>
          )}
        </div>
      </div>

      {/* 3. Preview Diff Details & Commit Action */}
      {previewData && (
        <div className="card" style={{ border: '2px solid #3b82f6' }}>
          <div className="card-header" style={{ backgroundColor: '#eff6ff' }}>
            <div>
              <h2 className="card-title" style={{ fontSize: 16, color: '#1e3a8a' }}>
                KẾT QUẢ KIỂM TRA DỮ LIỆU (PREVIEW DIFF)
              </h2>
              <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                File: <strong>{previewData.fileName}</strong> • Tổng số: <strong>{previewData.totalRows}</strong> dòng
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleCommitData}
                disabled={committing || (previewData.creates.length === 0 && previewData.updates.length === 0)}
                className="btn btn-success btn-lg"
                style={{ padding: '8px 20px' }}
              >
                {committing ? 'Đang lưu vào Database...' : 'XÁC NHẬN CẬP NHẬT VÀO HỆ THỐNG'}
                {!committing && <ArrowRight size={16} />}
              </button>
            </div>
          </div>

          <div className="card-body">
            {/* Diff Counters Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              <div style={{ padding: 12, backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6 }}>
                <div style={{ fontSize: 12, color: '#15803d', fontWeight: 600 }}>THÊM MỚI (CREATE)</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#16a34a' }}>{previewData.creates.length}</div>
              </div>

              <div style={{ padding: 12, backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6 }}>
                <div style={{ fontSize: 12, color: '#1e40af', fontWeight: 600 }}>CẬP NHẬT (UPDATE)</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#2563eb' }}>{previewData.updates.length}</div>
              </div>

              <div style={{ padding: 12, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                <div style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>KHÔNG ĐỔI (UNCHANGED)</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#64748b' }}>{previewData.unchanged.length}</div>
              </div>

              <div style={{ padding: 12, backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6 }}>
                <div style={{ fontSize: 12, color: '#991b1b', fontWeight: 600 }}>LỖI (ERRORS)</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#dc2626' }}>{previewData.errors.length}</div>
              </div>
            </div>

            {/* Error Lines Section */}
            {previewData.errors.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#dc2626', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={16} /> Các dòng dữ liệu bị lỗi (Sẽ bị bỏ qua nếu commit):
                </h3>
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 10, maxHeight: 180, overflowY: 'auto' }}>
                  {previewData.errors.map((err: any, idx: number) => (
                    <div key={idx} style={{ fontSize: 13, color: '#b91c1c', padding: '3px 0' }}>
                      <strong>Dòng {err.rowNumber}:</strong> {err.message}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Creates Section */}
            {previewData.creates.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#16a34a', marginBottom: 8 }}>
                  + Danh sách sản phẩm thêm mới ({previewData.creates.length}):
                </h3>
                <div className="table-container" style={{ maxHeight: 250 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Dòng</th>
                        <th>Mã SKU</th>
                        <th>Tên sản phẩm</th>
                        <th>Danh mục</th>
                        <th>Loại SP</th>
                        <th className="text-right">Giá nhập</th>
                        <th className="text-right">Giá bán</th>
                        <th className="text-right">Tồn ban đầu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.creates.map((p: any, idx: number) => (
                        <tr key={idx}>
                          <td>{p.rowNumber}</td>
                          <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{p.sku}</td>
                          <td style={{ fontWeight: 600 }}>{p.name}</td>
                          <td>{p.category_name}</td>
                          <td>{p.product_type_name}</td>
                          <td className="text-right">{p.cost_price?.toLocaleString('vi-VN')} đ</td>
                          <td className="text-right" style={{ fontWeight: 600, color: '#1d4ed8' }}>{p.selling_price?.toLocaleString('vi-VN')} đ</td>
                          <td className="text-right">{p.stock}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Updates Section */}
            {previewData.updates.length > 0 && (
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#2563eb', marginBottom: 8 }}>
                  ~ Danh sách sản phẩm cập nhật thông tin ({previewData.updates.length}):
                </h3>
                <div className="table-container" style={{ maxHeight: 250 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Dòng</th>
                        <th>Mã SKU</th>
                        <th>Tên sản phẩm</th>
                        <th>Các trường thay đổi chi tiết</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.updates.map((p: any, idx: number) => (
                        <tr key={idx}>
                          <td>{p.rowNumber}</td>
                          <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{p.sku}</td>
                          <td style={{ fontWeight: 600 }}>{p.name}</td>
                          <td>
                            {p.changes.map((c: string, cIdx: number) => (
                              <span key={cIdx} className="badge badge-neutral" style={{ marginRight: 6 }}>
                                {c}
                              </span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
