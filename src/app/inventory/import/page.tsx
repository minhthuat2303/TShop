'use client';

import React, { useState, useEffect } from 'react';
import { 
  ArrowDownToLine, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  Plus, 
  Clock, 
  Download,
  Upload,
  FileSpreadsheet,
  FileCheck,
  RefreshCw,
  ArrowRight
} from 'lucide-react';
import { useAuth } from '@/components/AuthContext';

export default function InventoryImportPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  
  // Tab: Single Import vs Bulk Excel Import
  const [importMode, setImportMode] = useState<'single' | 'excel'>('single');

  // Single Form fields
  const [productId, setProductId] = useState('');
  const [importDate, setImportDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [quantity, setQuantity] = useState(10);
  const [unitCostPrice, setUnitCostPrice] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [note, setNote] = useState('');

  // Bulk Excel Import fields (Requirement 4)
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelImportDate, setExcelImportDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);

  // States
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [recentMovements, setRecentMovements] = useState<any[]>([]);

  const loadData = async () => {
    try {
      const [prodRes, supRes, moveRes] = await Promise.all([
        fetch('/api/products?status=ACTIVE&limit=100'),
        fetch('/api/suppliers'),
        fetch('/api/inventory/movements?movementType=PURCHASE&limit=10'),
      ]);

      const prodJson = await prodRes.json();
      const supJson = await supRes.json();
      const moveJson = await moveRes.json();

      if (prodJson.success) {
        setProducts(prodJson.data);
        if (prodJson.data.length > 0 && !productId) {
          setProductId(prodJson.data[0].id);
          setUnitCostPrice(prodJson.data[0].current_cost_price.toString());
        }
      }
      if (supJson.success) setSuppliers(supJson.data);
      if (moveJson.success) setRecentMovements(moveJson.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleProductChange = (id: string) => {
    setProductId(id);
    const prod = products.find((p) => String(p.id) === String(id));
    if (prod) {
      setUnitCostPrice(prod.current_cost_price.toString());
    }
  };

  // Submit Single Receipt
  const handleSubmitSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/inventory/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: parseInt(productId),
          importDate,
          quantity,
          unitCostPrice: parseFloat(unitCostPrice),
          supplierId: supplierId ? parseInt(supplierId) : null,
          note: note.trim() || undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setFeedback({ type: 'error', message: json.error?.message || 'Nhập kho thất bại.' });
        return;
      }

      setFeedback({
        type: 'success',
        message: `Đã nhập thành công ${quantity} món cho sản phẩm. Tồn mới: ${json.data.balanceAfter} món.`,
      });

      setNote('');
      loadData();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Lỗi kết nối máy chủ.' });
    } finally {
      setSubmitting(false);
    }
  };

  // REQUIREMENT 4: Export current inventory list to Excel
  const handleExportStockTemplate = () => {
    window.open('/api/inventory/export-stock-template', '_blank');
  };

  // REQUIREMENT 4: Preview Bulk Import Excel
  const handlePreviewExcel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!excelFile) return;

    setPreviewing(true);
    setPreviewData(null);
    setFeedback(null);

    const formData = new FormData();
    formData.append('file', excelFile);
    formData.append('importDate', excelImportDate);
    formData.append('commit', 'false');

    try {
      const res = await fetch('/api/inventory/import-excel', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (json.success) {
        setPreviewData(json);
      } else {
        setFeedback({ type: 'error', message: json.error?.message || 'Lỗi kiểm tra file Excel.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setPreviewing(false);
    }
  };

  // REQUIREMENT 4: Commit Bulk Import Excel
  const handleCommitExcel = async () => {
    if (!excelFile || committing) return;
    setCommitting(true);

    const formData = new FormData();
    formData.append('file', excelFile);
    formData.append('importDate', excelImportDate);
    formData.append('commit', 'true');

    try {
      const res = await fetch('/api/inventory/import-excel', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (json.success) {
        setFeedback({ type: 'success', message: json.message || 'Nhập kho hàng loạt thành công!' });
        setPreviewData(null);
        setExcelFile(null);
        loadData();
      } else {
        setFeedback({ type: 'error', message: json.error?.message || 'Lỗi nhập kho từ Excel.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setCommitting(false);
    }
  };

  const selectedProdObj = products.find((p) => String(p.id) === String(productId));
  const formatVND = (v: number) => (v || 0).toLocaleString('vi-VN') + ' đ';

  return (
    <div style={{ maxWidth: 950, margin: '0 auto' }}>
      {/* 1. Header & Mode Switcher */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ padding: '14px 20px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12
          }}>
            <div>
              <h1 className="card-title" style={{ fontSize: 18 }}>NHẬP KHO HÀNG HÓA</h1>
              <p style={{ fontSize: 12.5, color: '#64748b', marginTop: 2 }}>
                Nhập hàng thủ công hoặc nhập hàng loạt nhanh chóng qua file Excel tồn kho
              </p>
            </div>

            {/* Mode Switcher */}
            <div style={{ display: 'flex', gap: 6, backgroundColor: '#f1f5f9', padding: 3, borderRadius: 6 }}>
              <button
                type="button"
                onClick={() => setImportMode('single')}
                className={`btn btn-sm ${importMode === 'single' ? 'btn-primary' : 'btn-secondary'}`}
              >
                Nhập từng món
              </button>
              <button
                type="button"
                onClick={() => setImportMode('excel')}
                className={`btn btn-sm ${importMode === 'excel' ? 'btn-primary' : 'btn-secondary'}`}
              >
                <FileSpreadsheet size={14} />
                <span>Nhập hàng loạt bằng Excel</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {feedback && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          backgroundColor: feedback.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${feedback.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
          borderRadius: 6,
          color: feedback.type === 'success' ? '#15803d' : '#dc2626',
          marginBottom: 16,
        }}>
          {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span style={{ fontWeight: 600 }}>{feedback.message}</span>
        </div>
      )}

      {/* 2. MODE 1: SINGLE ITEM IMPORT FORM */}
      {importMode === 'single' && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <h2 className="card-title" style={{ fontSize: 15 }}>Nhập kho từng sản phẩm</h2>
          </div>

          <div className="card-body">
            <form onSubmit={handleSubmitSingle}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Chọn sản phẩm nhập kho (*)</label>
                  <select
                    className="form-select"
                    value={productId}
                    onChange={(e) => handleProductChange(e.target.value)}
                    required
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        [{p.sku}] {p.name} (Tồn hiện tại: {p.current_stock})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Ngày nhập (*)</label>
                  <input
                    type="date"
                    className="form-input"
                    value={importDate}
                    onChange={(e) => setImportDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Số lượng nhập (*)</label>
                  <input
                    type="number"
                    className="form-input"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Đơn giá nhập thực tế (VNĐ) (*)</label>
                  <input
                    type="number"
                    className="form-input"
                    min="0"
                    value={unitCostPrice}
                    onChange={(e) => setUnitCostPrice(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Nhà cung cấp</label>
                  <select
                    className="form-select"
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                  >
                    <option value="">-- Chọn nhà cung cấp --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 20 }}>
                <label className="form-label">Ghi chú phiếu nhập</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ghi chú về lô hàng / số hóa đơn NCC (tuỳ chọn)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              {/* Total calculated box */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#f8fafc',
                padding: '14px 18px',
                borderRadius: 6,
                border: '1px solid var(--border-subtle)',
                marginBottom: 20,
              }}>
                <div>
                  <span style={{ fontSize: 13, color: '#64748b' }}>Tổng tiền thanh toán nhập hàng:</span>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#1d4ed8' }}>
                    {formatVND(quantity * (parseFloat(unitCostPrice) || 0))}
                  </div>
                </div>

                {selectedProdObj && (
                  <div style={{ textAlign: 'right', fontSize: 13, color: '#475569' }}>
                    <div>Tồn kho hiện có: <strong>{selectedProdObj.current_stock}</strong></div>
                    <div>Tồn sau khi nhập: <strong style={{ color: '#15803d' }}>{selectedProdObj.current_stock + quantity}</strong></div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-lg"
                style={{ width: '100%', height: 46 }}
                disabled={submitting}
              >
                <ArrowDownToLine size={18} />
                <span>{submitting ? 'Đang lưu phiếu nhập...' : 'XÁC NHẬN NHẬP KHO'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 3. MODE 2: BULK EXCEL STOCK-IN (REQUIREMENT 4) */}
      {importMode === 'excel' && (
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header" style={{ backgroundColor: '#f0fdf4' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileSpreadsheet size={18} color="#16a34a" />
                <h2 className="card-title" style={{ fontSize: 15, color: '#15803d' }}>
                  Quy trình nhập kho hàng loạt qua file Excel tồn kho
                </h2>
              </div>
            </div>

            <div className="card-body">
              {/* Step 1: Export Current Stock */}
              <div style={{
                padding: 16,
                backgroundColor: '#f8fafc',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
                marginBottom: 20,
              }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 4 }}>
                  Bước 1: Xuất file danh sách tồn kho hiện tại
                </div>
                <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
                  Tải file Excel đã có sẵn toàn bộ danh sách sản phẩm, mã SKU, tên và tồn kho hiện tại. Bạn chỉ cần mở file và điền số lượng vào cột <strong>"Số lượng nhập kho (*)"</strong>.
                </p>

                <button
                  type="button"
                  onClick={handleExportStockTemplate}
                  className="btn btn-success"
                >
                  <Download size={16} />
                  <span>XUẤT DANH SÁCH TỒN KHO HIỆN TẠI (.XLSX)</span>
                </button>
              </div>

              {/* Step 2: Upload and Preview */}
              <div style={{
                padding: 16,
                backgroundColor: '#ffffff',
                border: '1px solid var(--border-strong)',
                borderRadius: 8,
              }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', marginBottom: 4 }}>
                  Bước 2: Tải lên file Excel sau khi đã nhập số lượng
                </div>

                <form onSubmit={handlePreviewExcel}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 12, alignItems: 'center', marginTop: 12 }}>
                    <div>
                      <label className="form-label" style={{ marginBottom: 4 }}>Ngày nhập kho:</label>
                      <input
                        type="date"
                        className="form-input"
                        value={excelImportDate}
                        onChange={(e) => setExcelImportDate(e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <label className="form-label" style={{ marginBottom: 4 }}>Chọn file Excel:</label>
                      <input
                        type="file"
                        accept=".xlsx, .xls"
                        className="form-input"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            setExcelFile(e.target.files[0]);
                            setPreviewData(null);
                          }
                        }}
                        required
                      />
                    </div>

                    <div style={{ paddingTop: 20 }}>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={!excelFile || previewing}
                        style={{ height: 38 }}
                      >
                        {previewing ? 'Đang đọc...' : 'Kiểm tra file'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              {/* Preview Diff Box */}
              {previewData && (
                <div style={{ marginTop: 20, border: '2px solid #2563eb', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{
                    padding: '12px 18px',
                    backgroundColor: '#eff6ff',
                    borderBottom: '1px solid #bfdbfe',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#1e40af', fontSize: 15 }}>
                        KẾT QUẢ KIỂM TRA FILE NHẬP KHO
                      </div>
                      <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                        File: <strong>{previewData.fileName}</strong> • Tìm thấy <strong>{previewData.validRows.length}</strong> sản phẩm có nhập số lượng
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleCommitExcel}
                      className="btn btn-success btn-lg"
                      disabled={committing || previewData.validRows.length === 0}
                    >
                      {committing ? 'Đang lưu vào kho...' : `XÁC NHẬN NHẬP KHO (${previewData.totalImportItems} MÓN)`}
                      {!committing && <ArrowRight size={16} />}
                    </button>
                  </div>

                  <div style={{ padding: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                      <div style={{ padding: 10, backgroundColor: '#f0fdf4', borderRadius: 6 }}>
                        <div style={{ fontSize: 12, color: '#15803d' }}>Số loại sản phẩm nhập</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#16a34a' }}>{previewData.validRows.length}</div>
                      </div>

                      <div style={{ padding: 10, backgroundColor: '#eff6ff', borderRadius: 6 }}>
                        <div style={{ fontSize: 12, color: '#1e40af' }}>Tổng số lượng nhập</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#2563eb' }}>{previewData.totalImportItems} món</div>
                      </div>

                      <div style={{ padding: 10, backgroundColor: '#f8fafc', borderRadius: 6 }}>
                        <div style={{ fontSize: 12, color: '#475569' }}>Tổng giá trị tiền nhập</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{formatVND(previewData.totalImportAmount)}</div>
                      </div>
                    </div>

                    {/* Table of items to be imported */}
                    <div className="table-container" style={{ maxHeight: 300 }}>
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Mã SKU</th>
                            <th>Tên sản phẩm</th>
                            <th className="text-right">Tồn hiện tại</th>
                            <th className="text-right" style={{ color: '#15803d' }}>SL nhập thêm</th>
                            <th className="text-right">Tồn sau nhập</th>
                            <th className="text-right">Đơn giá nhập</th>
                            <th className="text-right">Thành tiền</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.validRows.map((row: any, idx: number) => (
                            <tr key={idx}>
                              <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{row.sku}</td>
                              <td style={{ fontWeight: 600 }}>{row.name}</td>
                              <td className="text-right">{row.currentStock}</td>
                              <td className="text-right" style={{ fontWeight: 700, color: '#15803d' }}>
                                +{row.importQuantity}
                              </td>
                              <td className="text-right" style={{ fontWeight: 700 }}>{row.balanceAfter}</td>
                              <td className="text-right">{formatVND(row.unitCostPrice)}</td>
                              <td className="text-right" style={{ fontWeight: 600, color: '#1d4ed8' }}>
                                {formatVND(row.totalAmount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. Recent Imports History */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16} color="#64748b" />
            <h3 className="card-title" style={{ fontSize: 14 }}>Lịch sử các lần nhập hàng gần đây</h3>
          </div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ngày nhập</th>
                <th>Sản phẩm</th>
                <th className="text-right">Số lượng nhập</th>
                <th className="text-right">Tồn sau nhập</th>
                <th>Ghi chú</th>
                <th>Người thực hiện</th>
              </tr>
            </thead>
            <tbody>
              {recentMovements.map((m) => (
                <tr key={m.id}>
                  <td>{m.movement_date}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{m.product_name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>SKU: {m.sku}</div>
                  </td>
                  <td className="text-right" style={{ fontWeight: 700, color: '#15803d' }}>
                    +{m.quantity_change}
                  </td>
                  <td className="text-right" style={{ fontWeight: 700 }}>{m.balance_after}</td>
                  <td style={{ fontSize: 12, color: '#64748b' }}>{m.note || '-'}</td>
                  <td style={{ fontSize: 12 }}>{m.creator_name || 'Hệ thống'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
