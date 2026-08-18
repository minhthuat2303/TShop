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
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '@/components/AuthContext';
import { formatCurrency } from '@/lib/formatters';

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
    <div style={{ maxWidth: 1000, margin: '0 auto', width: '100%' }}>
      {/* 1. Header & Download Templates Section */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header" style={{ padding: '12px 16px' }}>
          <div>
            <h1 className="card-title" style={{ fontSize: 16 }}>QUẢN LÝ DỮ LIỆU EXCEL</h1>
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Quy trình 3 bước: Tải mẫu $\rightarrow$ Xem Preview Diff $\rightarrow$ Xác nhận cập nhật
            </p>
          </div>
        </div>

        <div className="card-body">
          <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 8 }}>
            Bước 1: Tải file mẫu Excel chuẩn
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
            <button
              onClick={() => handleDownloadTemplate('products')}
              className="btn btn-secondary"
              style={{ justifyContent: 'flex-start' }}
            >
              <Download size={15} color="#2563eb" />
              <span>Mẫu Sản phẩm (.xlsx)</span>
            </button>

            <button
              onClick={() => handleDownloadTemplate('categories')}
              className="btn btn-secondary"
              style={{ justifyContent: 'flex-start' }}
            >
              <Download size={15} color="#059669" />
              <span>Mẫu Danh mục (.xlsx)</span>
            </button>

            <button
              onClick={() => handleDownloadTemplate('product_types')}
              className="btn btn-secondary"
              style={{ justifyContent: 'flex-start' }}
            >
              <Download size={15} color="#7c3aed" />
              <span>Mẫu Loại SP (.xlsx)</span>
            </button>

            <button
              onClick={() => handleDownloadTemplate('imports')}
              className="btn btn-secondary"
              style={{ justifyContent: 'flex-start' }}
            >
              <Download size={15} color="#d97706" />
              <span>Mẫu Nhập kho (.xlsx)</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Upload & Validation Form */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 10 }}>
            Bước 2: Tải lên file Excel để kiểm tra tính hợp lệ & Xem trước (Preview)
          </div>

          <form onSubmit={handleGeneratePreview}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'flex-end' }}>
              <div>
                <label className="form-label" style={{ marginBottom: 3 }}>Loại dữ liệu:</label>
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
              </div>

              <div>
                <label className="form-label" style={{ marginBottom: 3 }}>Chọn file Excel:</label>
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  className="form-input"
                  onChange={handleFileChange}
                  required
                />
              </div>

              <div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!file || previewing}
                  style={{ width: '100%', height: 38 }}
                >
                  {previewing ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Đang kiểm tra...</span>
                    </>
                  ) : (
                    <>
                      <FileCheck size={15} />
                      <span>Xem Preview Diff</span>
                    </>
                  )}
                </button>
              </div>
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
              marginTop: 12,
            }}>
              {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span style={{ fontWeight: 600 }}>{feedback.message}</span>
            </div>
          )}
        </div>
      </div>

      {/* 3. Preview Diff Details & Commit Action */}
      {previewData && (
        <div className="card" style={{ border: '1.5px solid #3b82f6' }}>
          <div className="card-header" style={{ backgroundColor: '#eff6ff', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 className="card-title" style={{ fontSize: 15, color: '#1e3a8a' }}>
                KẾT QUẢ KIỂM TRA DỮ LIỆU (PREVIEW DIFF)
              </h2>
              <div style={{ fontSize: 12, color: '#475569', marginTop: 1 }}>
                File: <strong>{previewData.fileName}</strong> • Tổng số: <strong>{previewData.totalRows}</strong> dòng
              </div>
            </div>

            <button
              onClick={handleCommitData}
              disabled={committing || (previewData.creates.length === 0 && previewData.updates.length === 0)}
              className="btn btn-success"
            >
              {committing ? 'Đang lưu vào Database...' : 'XÁC NHẬN CẬP NHẬT'}
              {!committing && <ArrowRight size={15} />}
            </button>
          </div>

          <div className="card-body">
            {/* Diff Counters Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginBottom: 14 }}>
              <div style={{ padding: 10, backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: '#15803d', fontWeight: 600 }}>THÊM MỚI</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#16a34a' }}>{previewData.creates.length}</div>
              </div>

              <div style={{ padding: 10, backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 600 }}>CẬP NHẬT</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#2563eb' }}>{previewData.updates.length}</div>
              </div>

              <div style={{ padding: 10, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>KHÔNG ĐỔI</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#64748b' }}>{previewData.unchanged.length}</div>
              </div>

              <div style={{ padding: 10, backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: '#991b1b', fontWeight: 600 }}>LỖI</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#dc2626' }}>{previewData.errors.length}</div>
              </div>
            </div>

            {/* Error Lines Section */}
            {previewData.errors.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle size={15} /> Các dòng dữ liệu bị lỗi (sẽ bị bỏ qua):
                </h3>
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 8, maxHeight: 150, overflowY: 'auto' }}>
                  {previewData.errors.map((err: any, idx: number) => (
                    <div key={idx} style={{ fontSize: 12, color: '#b91c1c', padding: '2px 0' }}>
                      <strong>Dòng {err.rowNumber}:</strong> {err.message}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Creates Section */}
            {previewData.creates.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <h3 style={{ fontSize: 13.5, fontWeight: 700, color: '#16a34a', marginBottom: 6 }}>
                  + Danh sách sản phẩm thêm mới ({previewData.creates.length}):
                </h3>
                <div className="table-container" style={{ maxHeight: 220 }}>
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
                          <td className="text-right">{formatCurrency(p.cost_price)}</td>
                          <td className="text-right" style={{ fontWeight: 600, color: '#1d4ed8' }}>{formatCurrency(p.selling_price)}</td>
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
                <h3 style={{ fontSize: 13.5, fontWeight: 700, color: '#2563eb', marginBottom: 6 }}>
                  ~ Danh sách sản phẩm cập nhật ({previewData.updates.length}):
                </h3>
                <div className="table-container" style={{ maxHeight: 220 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Dòng</th>
                        <th>Mã SKU</th>
                        <th>Tên sản phẩm</th>
                        <th>Các trường thay đổi</th>
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
                              <span key={cIdx} className="badge badge-neutral" style={{ marginRight: 4, marginBottom: 2 }}>
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
