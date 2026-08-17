'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  Plus, 
  Minus, 
  Trash2,
  ArrowRight,
  Package,
  Boxes,
  Clock,
  RefreshCw,
  ShoppingBag,
  Percent,
  Check,
  XCircle,
  X,
  AlertTriangle,
  RotateCcw,
  Ban,
  Download,
  Filter,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '@/components/AuthContext';

interface ProductItem {
  id: number;
  sku: string;
  name: string;
  category_id: number;
  category_name: string;
  product_type_name: string;
  current_stock: number;
  current_selling_price: number;
  current_cost_price: number;
  status: string;
}

interface SelectedSaleItem {
  productId: number;
  sku: string;
  name: string;
  currentStock: number;
  unitPrice: number;
  costPrice: number;
  quantity: number;
  discountThousand: number; // Unit: 1000 VND (e.g. 5 = 5000 VND)
  note: string;
}

export default function FastSalesPage() {
  const { user } = useAuth();
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [allProducts, setAllProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingProds, setLoadingProds] = useState(true);

  // Selected items list to sell in batch
  const [selectedItems, setSelectedItems] = useState<SelectedSaleItem[]>([]);

  // Submission & feedback states
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sales History State (Requirement 1)
  const [historyStartDate, setHistoryStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [historyEndDate, setHistoryEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('ALL');
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLimit, setHistoryLimit] = useState(10);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [salesPagination, setSalesPagination] = useState({ total: 0, totalPages: 1, page: 1 });
  const [recentSalesSummary, setRecentSalesSummary] = useState<any>(null);
  const [loadingSales, setLoadingSales] = useState(false);
  const [exportingSales, setExportingSales] = useState(false);

  // Cancellation Modal State
  const [cancellingSale, setCancellingSale] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('Khách đổi ý không mua');
  const [cancelLoading, setCancelLoading] = useState(false);

  // Load products & categories
  const loadInitialData = async () => {
    setLoadingProds(true);
    try {
      const [prodRes, catRes] = await Promise.all([
        fetch('/api/products?status=ACTIVE&limit=300'),
        fetch('/api/categories'),
      ]);

      const prodJson = await prodRes.json();
      const catJson = await catRes.json();

      if (prodJson.success) setAllProducts(prodJson.data);
      if (catJson.success) setCategories(catJson.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProds(false);
    }
  };

  // Load sales history with filters & pagination (Requirement 1)
  const loadRecentSales = useCallback(async () => {
    setLoadingSales(true);
    try {
      let url = `/api/sales?page=${historyPage}&limit=${historyLimit}`;
      if (historyStartDate) url += `&startDate=${historyStartDate}`;
      if (historyEndDate) url += `&endDate=${historyEndDate}`;
      if (historyStatus && historyStatus !== 'ALL') url += `&status=${historyStatus}`;
      if (historySearch.trim()) url += `&q=${encodeURIComponent(historySearch.trim())}`;

      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setRecentSales(json.data || []);
        setSalesPagination(json.pagination || { total: 0, totalPages: 1, page: 1 });
        setRecentSalesSummary(json.summary);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSales(false);
    }
  }, [historyStartDate, historyEndDate, historySearch, historyStatus, historyPage, historyLimit]);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    loadRecentSales();
  }, [loadRecentSales]);

  // Re-resolve prices for selected items if saleDate changes
  useEffect(() => {
    if (selectedItems.length === 0) return;

    selectedItems.forEach(async (it) => {
      try {
        const res = await fetch(`/api/sales/resolve-price?productId=${it.productId}&date=${saleDate}`);
        const json = await res.json();
        if (json.success) {
          setSelectedItems((prev) =>
            prev.map((item) =>
              item.productId === it.productId
                ? { ...item, unitPrice: json.data.sellingPrice, costPrice: json.data.costPrice }
                : item
            )
          );
        }
      } catch (e) {
        console.error(e);
      }
    });
  }, [saleDate]);

  // Add product to selected list or increment quantity if already added
  const handleSelectProduct = async (product: ProductItem) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const existingIndex = selectedItems.findIndex((it) => it.productId === product.id);

    if (existingIndex > -1) {
      // Increment quantity
      setSelectedItems((prev) =>
        prev.map((it, idx) =>
          idx === existingIndex
            ? { ...it, quantity: Math.min(it.currentStock, it.quantity + 1) }
            : it
        )
      );
    } else {
      // Resolve price at saleDate
      try {
        const res = await fetch(`/api/sales/resolve-price?productId=${product.id}&date=${saleDate}`);
        const json = await res.json();
        const sellingPrice = json.success ? json.data.sellingPrice : product.current_selling_price;
        const costPrice = json.success ? json.data.costPrice : product.current_cost_price;

        setSelectedItems((prev) => [
          ...prev,
          {
            productId: product.id,
            sku: product.sku,
            name: product.name,
            currentStock: product.current_stock,
            unitPrice: sellingPrice,
            costPrice: costPrice,
            quantity: 1,
            discountThousand: 0,
            note: '',
          },
        ]);
      } catch {
        setSelectedItems((prev) => [
          ...prev,
          {
            productId: product.id,
            sku: product.sku,
            name: product.name,
            currentStock: product.current_stock,
            unitPrice: product.current_selling_price,
            costPrice: product.current_cost_price,
            quantity: 1,
            discountThousand: 0,
            note: '',
          },
        ]);
      }
    }
  };

  // Remove product from selected list
  const handleRemoveItem = (productId: number) => {
    setSelectedItems((prev) => prev.filter((it) => it.productId !== productId));
  };

  // Adjust quantity
  const handleQuantityChange = (productId: number, newQty: number) => {
    if (isNaN(newQty) || newQty <= 0) {
      handleRemoveItem(productId);
      return;
    }

    setSelectedItems((prev) =>
      prev.map((it) =>
        it.productId === productId
          ? { ...it, quantity: Math.min(it.currentStock, Math.max(1, newQty)) }
          : it
      )
    );
  };

  // Adjust discount in thousands (VD: 5 = 5,000 VND)
  const handleDiscountChange = (productId: number, discountStr: string) => {
    const val = parseFloat(discountStr) || 0;
    setSelectedItems((prev) =>
      prev.map((it) =>
        it.productId === productId
          ? { ...it, discountThousand: Math.max(0, val) }
          : it
      )
    );
  };

  // Filtered products on the left
  const filteredProducts = allProducts.filter((p) => {
    if (selectedCategory && String(p.category_id) !== String(selectedCategory)) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
    }
    return true;
  });

  // Calculate Totals
  const totalSubtotal = selectedItems.reduce((acc, it) => acc + (it.quantity * it.unitPrice), 0);
  const totalDiscount = selectedItems.reduce((acc, it) => acc + (it.discountThousand * 1000), 0);
  const finalTotalRevenue = Math.max(0, totalSubtotal - totalDiscount);
  const totalQuantity = selectedItems.reduce((acc, it) => acc + it.quantity, 0);

  // Submit Batch Sale
  const handleSubmitBatchSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItems.length === 0) {
      setErrorMessage('Vui lòng chọn ít nhất 1 sản phẩm.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleDate,
          items: selectedItems.map((it) => ({
            productId: it.productId,
            quantity: it.quantity,
            discountThousand: it.discountThousand,
            note: it.note,
          })),
        }),
      });

      const json = await res.json();
      if (json.success) {
        setSuccessMessage(json.message || 'Ghi nhận bán hàng thành công!');
        setSelectedItems([]);
        loadRecentSales();
        loadInitialData(); // Refresh stock
      } else {
        setErrorMessage(json.error?.message || 'Có lỗi xảy ra khi ghi nhận bán.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi kết nối.');
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel Sale Confirmation
  const handleConfirmCancelSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingSale) return;

    setCancelLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/sales/${cancellingSale.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason }),
      });

      const json = await res.json();
      if (json.success) {
        setSuccessMessage(json.message || `Đã hủy phiếu [${cancellingSale.transaction_code}] thành công.`);
        setCancellingSale(null);
        setCancelReason('Khách đổi ý không mua');
        loadRecentSales();
        loadInitialData();
      } else {
        setErrorMessage(json.error?.message || 'Lỗi hủy phiếu bán hàng.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi kết nối.');
    } finally {
      setCancelLoading(false);
    }
  };

  // Export Sales History to Excel (Requirement 1)
  const handleExportSalesExcel = async () => {
    if (exportingSales) return;
    setExportingSales(true);
    try {
      let url = `/api/sales/export-excel?`;
      if (historyStartDate) url += `&startDate=${historyStartDate}`;
      if (historyEndDate) url += `&endDate=${historyEndDate}`;
      if (historyStatus && historyStatus !== 'ALL') url += `&status=${historyStatus}`;
      if (historySearch.trim()) url += `&q=${encodeURIComponent(historySearch.trim())}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error('Lỗi xuất file');
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `Lich_su_ban_hang_${historyStartDate}_${historyEndDate}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (e) {
      console.error(e);
      window.location.href = `/api/sales/export-excel?startDate=${historyStartDate}&endDate=${historyEndDate}`;
    } finally {
      setExportingSales(false);
    }
  };

  const formatVND = (num: number) => (num || 0).toLocaleString('vi-VN') + ' đ';

  return (
    <div>
      {/* 1. Date and Top Toolbar */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: 8,
        border: '1px solid var(--border-subtle)',
        padding: '10px 16px',
        marginBottom: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#334155', fontWeight: 600, fontSize: 13 }}>
            <Calendar size={15} color="#64748b" />
            <span>Ngày bán hàng:</span>
          </div>
          <input
            type="date"
            className="form-input"
            style={{ width: 145, height: 32, padding: '2px 8px', fontSize: 12.5 }}
            value={saleDate}
            onChange={(e) => {
              setSaleDate(e.target.value);
              setHistoryStartDate(e.target.value);
              setHistoryEndDate(e.target.value);
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => { loadInitialData(); loadRecentSales(); }}
            className="btn btn-secondary btn-sm"
          >
            <RefreshCw size={13} className={loadingProds ? 'animate-spin' : ''} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* Feedback Messages */}
      {successMessage && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: 6,
          color: '#15803d',
          marginBottom: 14,
          fontSize: 13,
        }}>
          <CheckCircle2 size={16} />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 6,
          color: '#dc2626',
          marginBottom: 14,
          fontSize: 13,
        }}>
          <AlertCircle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 2. Main 2-Column POS Layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(320px, 4.2fr) minmax(420px, 5.8fr)',
        gap: 14,
        marginBottom: 18,
      }}>
        {/* LEFT COLUMN: PRODUCT CATALOG */}
        <div className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', height: '560px' }}>
          <div className="card-header" style={{ padding: '10px 14px', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Package size={15} color="#475569" />
              <h3 className="card-title" style={{ fontSize: 13.5 }}>Danh mục sản phẩm</h3>
            </div>
            <span style={{ fontSize: 11.5, color: '#64748b' }}>
              {filteredProducts.length} sản phẩm
            </span>
          </div>

          {/* Search & Filter Bar */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: 28, height: 30, fontSize: 12 }}
                placeholder="Tìm tên, SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search size={13} color="#94a3b8" style={{ position: 'absolute', left: 8, top: 8 }} />
            </div>

            <select
              className="form-select"
              style={{ width: 140, height: 30, padding: '2px 6px', fontSize: 11.5 }}
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">Tất cả danh mục</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Product Items List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {loadingProds ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b', fontSize: 12.5 }}>
                Đang tải sản phẩm...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 12.5 }}>
                Không tìm thấy sản phẩm nào.
              </div>
            ) : (
              filteredProducts.map((prod) => {
                const isSelected = selectedItems.some((it) => it.productId === prod.id);
                const isOutOfStock = prod.current_stock <= 0;

                return (
                  <div
                    key={prod.id}
                    onClick={() => !isOutOfStock && handleSelectProduct(prod)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: isSelected ? '1.5px solid #0f172a' : '1px solid #e2e8f0',
                      backgroundColor: isOutOfStock ? '#f8fafc' : isSelected ? '#f1f5f9' : '#ffffff',
                      cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                      opacity: isOutOfStock ? 0.6 : 1,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 12.5, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {prod.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 8, marginTop: 2 }}>
                        <span>SKU: {prod.sku}</span>
                        <span>•</span>
                        <span>{prod.product_type_name}</span>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 12.5, color: '#0f172a' }}>
                        {formatVND(prod.current_selling_price)}
                      </div>
                      <div style={{ fontSize: 11, color: isOutOfStock ? '#dc2626' : '#059669', fontWeight: 500 }}>
                        {isOutOfStock ? 'Hết hàng' : `Tồn: ${prod.current_stock}`}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: CURRENT CART / SALE BATCH */}
        <div className="card" style={{ marginBottom: 0, display: 'flex', flexDirection: 'column', height: '560px' }}>
          <div className="card-header" style={{ padding: '10px 14px', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShoppingBag size={15} color="#475569" />
              <h3 className="card-title" style={{ fontSize: 13.5 }}>Giỏ hàng bán ra ({selectedItems.length} món)</h3>
            </div>

            {selectedItems.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedItems([])}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: 11, padding: '2px 8px', height: 26 }}
              >
                <Trash2 size={11} />
                <span>Xóa hết</span>
              </button>
            )}
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '10px 14px' }}>
            {selectedItems.length === 0 ? (
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94a3b8',
                gap: 8,
              }}>
                <ShoppingBag size={36} strokeWidth={1.5} color="#cbd5e1" />
                <div style={{ fontSize: 13, fontWeight: 500 }}>Chưa có sản phẩm nào được chọn.</div>
                <div style={{ fontSize: 11.5, color: '#94a3b8' }}>Nhấp chọn các sản phẩm ở danh mục bên trái.</div>
              </div>
            ) : (
              <form onSubmit={handleSubmitBatchSale} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12 }}>
                  <table className="data-table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th>Sản phẩm</th>
                        <th className="text-right" style={{ width: 85 }}>Đơn giá</th>
                        <th className="text-center" style={{ width: 95 }}>Số lượng</th>
                        <th className="text-center" style={{ width: 90 }} title="Đơn vị nhập: 1.000 đồng (VD: nhập 5 = giảm 5.000đ)">
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                            <Percent size={11} />
                            <span>Giảm (kđ)</span>
                          </div>
                        </th>
                        <th className="text-right" style={{ width: 100 }}>Thành tiền</th>
                        <th style={{ width: 30 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedItems.map((item) => {
                        const itemDiscountVND = (item.discountThousand || 0) * 1000;
                        const itemSubtotal = item.quantity * item.unitPrice;
                        const itemTotal = Math.max(0, itemSubtotal - itemDiscountVND);

                        return (
                          <tr key={item.productId}>
                            <td>
                              <div style={{ fontWeight: 600, color: '#0f172a' }}>{item.name}</div>
                              <div style={{ fontSize: 11, color: '#64748b' }}>
                                SKU: {item.sku} • Tồn: <span style={{ color: '#059669', fontWeight: 600 }}>{item.currentStock}</span>
                              </div>
                            </td>

                            <td className="text-right" style={{ fontWeight: 500 }}>
                              {formatVND(item.unitPrice)}
                            </td>

                            <td className="text-center">
                              <div className="stepper" style={{ height: 26 }}>
                                <button
                                  type="button"
                                  className="stepper-btn"
                                  style={{ width: 24, height: 26, fontSize: 13 }}
                                  onClick={() => handleQuantityChange(item.productId, item.quantity - 1)}
                                >
                                  <Minus size={11} />
                                </button>
                                <input
                                  type="number"
                                  className="stepper-input"
                                  style={{ width: 34, height: 26, fontSize: 12 }}
                                  value={item.quantity}
                                  min="1"
                                  max={item.currentStock}
                                  onChange={(e) => handleQuantityChange(item.productId, parseInt(e.target.value) || 1)}
                                />
                                <button
                                  type="button"
                                  className="stepper-btn"
                                  style={{ width: 24, height: 26, fontSize: 13 }}
                                  onClick={() => handleQuantityChange(item.productId, item.quantity + 1)}
                                >
                                  <Plus size={11} />
                                </button>
                              </div>
                            </td>

                            {/* DISCOUNT INPUT: UNIT IS 1000 VND */}
                            <td className="text-center">
                              <div style={{ position: 'relative', display: 'inline-block' }}>
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  className="form-input"
                                  style={{
                                    width: 70,
                                    height: 26,
                                    padding: '2px 4px',
                                    fontSize: 12,
                                    textAlign: 'right',
                                    fontWeight: 600,
                                    color: item.discountThousand > 0 ? '#dc2626' : undefined,
                                  }}
                                  placeholder="0"
                                  value={item.discountThousand === 0 ? '' : item.discountThousand}
                                  onChange={(e) => handleDiscountChange(item.productId, e.target.value)}
                                  title="Nhập 5 = giảm 5.000đ, nhập 10 = giảm 10.000đ"
                                />
                              </div>
                              {item.discountThousand > 0 && (
                                <div style={{ fontSize: 9.5, color: '#dc2626', marginTop: 1 }}>
                                  -{itemDiscountVND.toLocaleString()}đ
                                </div>
                              )}
                            </td>

                            <td className="text-right" style={{ fontWeight: 700, color: '#0f172a' }}>
                              {formatVND(itemTotal)}
                            </td>

                            <td className="text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(item.productId)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                                title="Xóa món này"
                              >
                                <Trash2 size={13} color="#ef4444" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Calculation Summary Footer */}
                <div style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  padding: '10px 14px',
                  marginBottom: 10,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: '#64748b' }}>Tổng số lượng:</span>
                    <strong style={{ color: '#0f172a' }}>{totalQuantity} món ({selectedItems.length} loại)</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: '#64748b' }}>Tạm tính:</span>
                    <span>{formatVND(totalSubtotal)}</span>
                  </div>

                  {totalDiscount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#dc2626', marginBottom: 3 }}>
                      <span>Tổng giảm giá:</span>
                      <strong>-{formatVND(totalDiscount)}</strong>
                    </div>
                  )}

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: 6,
                    marginTop: 4,
                    borderTop: '1.5px solid var(--border-strong)',
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>TỔNG THANH TOÁN:</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: '#16a34a' }}>
                      {formatVND(finalTotalRevenue)}
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  style={{ width: '100%', height: 42, fontSize: 14 }}
                  disabled={submitting || selectedItems.length === 0}
                >
                  {submitting ? 'Đang lưu giao dịch...' : `GHI NHẬN BÁN HÀNG (${selectedItems.length} SẢN PHẨM)`}
                  {!submitting && <ArrowRight size={16} />}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* 3. LỊCH SỬ BÁN HÀNG TOÀN DIỆN (REQUIREMENT 1) */}
      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: 10, padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16} color="#475569" />
            <div>
              <h3 className="card-title" style={{ fontSize: 14 }}>Lịch sử bán hàng chi tiết</h3>
              <p style={{ fontSize: 11.5, color: '#64748b', marginTop: 1 }}>
                Tra cứu, tìm kiếm và xuất file lịch sử bán hàng theo thời gian
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handleExportSalesExcel}
              className="btn btn-success btn-sm"
              disabled={exportingSales}
              title="Xuất danh sách bán hàng ra file Excel .xlsx"
            >
              <Download size={13} />
              <span>{exportingSales ? 'Đang xuất...' : 'Xuất file lịch sử bán'}</span>
            </button>
          </div>
        </div>

        {/* Filter & Search Toolbar */}
        <div style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: '#fafafa',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#475569' }}>
              <Filter size={13} />
              <span>Từ ngày:</span>
            </div>
            <input
              type="date"
              className="form-input"
              style={{ width: 135, height: 30, fontSize: 12, padding: '2px 6px' }}
              value={historyStartDate}
              onChange={(e) => { setHistoryStartDate(e.target.value); setHistoryPage(1); }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#475569' }}>
              <span>Đến:</span>
            </div>
            <input
              type="date"
              className="form-input"
              style={{ width: 135, height: 30, fontSize: 12, padding: '2px 6px' }}
              value={historyEndDate}
              onChange={(e) => { setHistoryEndDate(e.target.value); setHistoryPage(1); }}
            />

            <select
              className="form-select"
              style={{ height: 30, width: 135, fontSize: 12, padding: '2px 6px' }}
              value={historyStatus}
              onChange={(e) => { setHistoryStatus(e.target.value); setHistoryPage(1); }}
            >
              <option value="ALL">[Tất cả trạng thái]</option>
              <option value="COMPLETED">Thành công</option>
              <option value="CANCELLED">Đã hủy</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative', width: 220 }}>
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: 28, height: 30, fontSize: 12 }}
                placeholder="Tìm mã GD, SKU, tên SP..."
                value={historySearch}
                onChange={(e) => { setHistorySearch(e.target.value); setHistoryPage(1); }}
              />
              <Search size={13} color="#94a3b8" style={{ position: 'absolute', left: 8, top: 8 }} />
            </div>

            <select
              className="form-select"
              style={{ height: 30, width: 90, fontSize: 12, padding: '2px 6px' }}
              value={historyLimit}
              onChange={(e) => { setHistoryLimit(parseInt(e.target.value, 10)); setHistoryPage(1); }}
              title="Số dòng trên mỗi trang"
            >
              <option value="10">10 dòng</option>
              <option value="20">20 dòng</option>
              <option value="50">50 dòng</option>
              <option value="100">100 dòng</option>
            </select>
          </div>
        </div>

        {/* Summary Metric Strip */}
        {recentSalesSummary && (
          <div style={{
            padding: '8px 14px',
            backgroundColor: '#ffffff',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            gap: 16,
            fontSize: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}>
            <div>
              <span style={{ color: '#64748b' }}>Tổng giao dịch: </span>
              <strong style={{ color: '#0f172a' }}>{salesPagination.total} lượt</strong>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>Tổng thực thu: </span>
              <strong style={{ color: '#16a34a' }}>{formatVND(recentSalesSummary.totalRevenue)}</strong>
            </div>
            <div>
              <span style={{ color: '#64748b' }}>Lợi nhuận gộp: </span>
              <strong style={{ color: '#0f172a' }}>{formatVND(recentSalesSummary.totalProfit)}</strong>
            </div>
            {recentSalesSummary.cancelledCount > 0 && (
              <div style={{ backgroundColor: '#fef2f2', padding: '2px 8px', borderRadius: 4, border: '1px solid #fecaca', color: '#dc2626' }}>
                <span>Đã hủy: </span>
                <strong>{recentSalesSummary.cancelledCount} phiếu ({formatVND(recentSalesSummary.cancelledRevenue)})</strong>
              </div>
            )}
          </div>
        )}

        {/* Sales Table */}
        <div className="table-container">
          <table className="data-table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ width: 130 }}>Mã giao dịch</th>
                <th style={{ width: 95 }}>Ngày bán</th>
                <th>Sản phẩm</th>
                <th className="text-right" style={{ width: 65 }}>SL</th>
                <th className="text-right" style={{ width: 90 }}>Đơn giá</th>
                <th className="text-right" style={{ width: 85 }}>Giảm giá</th>
                <th className="text-right" style={{ width: 105 }}>Doanh thu</th>
                <th className="text-right" style={{ width: 95 }}>Lợi nhuận</th>
                <th className="text-center" style={{ width: 95 }}>Trạng thái</th>
                <th style={{ width: 110 }}>Người bán</th>
                {user?.role === 'ADMIN' && <th className="text-center" style={{ width: 80 }}>Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {loadingSales ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '28px 0', color: '#64748b' }}>
                    Đang tải lịch sử bán hàng...
                  </td>
                </tr>
              ) : recentSales.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '28px 0', color: '#94a3b8' }}>
                    Không có giao dịch bán nào phù hợp với bộ lọc.
                  </td>
                </tr>
              ) : (
                recentSales.map((sale) => {
                  const isCancelled = sale.status === 'CANCELLED';

                  return (
                    <tr key={sale.id} style={{ opacity: isCancelled ? 0.65 : 1, backgroundColor: isCancelled ? '#fafafa' : undefined }}>
                      <td style={{ fontSize: 11.5, fontFamily: 'monospace', color: isCancelled ? '#94a3b8' : '#0f172a', textDecoration: isCancelled ? 'line-through' : 'none' }}>
                        {sale.transaction_code}
                      </td>
                      <td style={{ color: '#475569' }}>{sale.sale_date}</td>
                      <td>
                        <div style={{ fontWeight: 600, color: isCancelled ? '#64748b' : '#0f172a' }}>{sale.product_name}</div>
                        <div style={{ fontSize: 10.5, color: '#64748b' }}>SKU: {sale.sku} • {sale.product_type_name}</div>
                      </td>
                      <td className="text-right" style={{ fontWeight: 700, color: isCancelled ? '#94a3b8' : '#0f172a' }}>
                        {sale.quantity}
                      </td>
                      <td className="text-right">{formatVND(sale.unit_price_at_sale)}</td>
                      <td className="text-right" style={{ color: sale.discount > 0 ? '#dc2626' : '#94a3b8' }}>
                        {sale.discount > 0 ? `-${formatVND(sale.discount)}` : '0đ'}
                      </td>
                      <td className="text-right" style={{ fontWeight: 700, color: isCancelled ? '#94a3b8' : '#0f172a' }}>
                        {formatVND(sale.total_revenue)}
                      </td>
                      <td className="text-right" style={{ fontWeight: 600, color: isCancelled ? '#94a3b8' : '#15803d' }}>
                        {formatVND(sale.profit)}
                      </td>
                      <td className="text-center">
                        {isCancelled ? (
                          <span className="badge badge-danger" title={`Lý do: ${sale.cancel_reason || 'Không rõ'} (bởi ${sale.canceller_name || 'Admin'})`}>
                            Đã hủy
                          </span>
                        ) : (
                          <span className="badge badge-success">
                            Thành công
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 11.5, color: '#64748b' }}>
                        {sale.seller_name || 'Hệ thống'}
                      </td>
                      {user?.role === 'ADMIN' && (
                        <td className="text-center">
                          {!isCancelled ? (
                            <button
                              type="button"
                              onClick={() => {
                                setCancellingSale(sale);
                                setCancelReason('Khách đổi ý không mua');
                              }}
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '2px 8px', fontSize: 11, color: '#dc2626', borderColor: '#fecaca' }}
                              title="Hủy phiếu bán hàng này"
                            >
                              <Ban size={11} />
                              <span>Hủy</span>
                            </button>
                          ) : (
                            <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>
                              Đã hủy
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {salesPagination.totalPages > 1 && (
          <div style={{
            padding: '10px 14px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12,
          }}>
            <div style={{ color: '#64748b' }}>
              Hiển thị {(historyPage - 1) * historyLimit + 1} - {Math.min(historyPage * historyLimit, salesPagination.total)} trong tổng số {salesPagination.total} giao dịch
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                disabled={historyPage <= 1}
                style={{ padding: '3px 8px' }}
              >
                <ChevronLeft size={13} />
                <span>Trước</span>
              </button>

              <span style={{ fontWeight: 600, color: '#0f172a', padding: '0 4px' }}>
                Trang {historyPage} / {salesPagination.totalPages}
              </span>

              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setHistoryPage((p) => Math.min(salesPagination.totalPages, p + 1))}
                disabled={historyPage >= salesPagination.totalPages}
                style={{ padding: '3px 8px' }}
              >
                <span>Sau</span>
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. CANCELLATION CONFIRMATION MODAL */}
      {cancellingSale && (
        <div className="modal-backdrop" onClick={() => !cancelLoading && setCancellingSale(null)}>
          <div className="modal-content" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleConfirmCancelSale}>
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626' }}>
                  <AlertTriangle size={18} />
                  <h3 className="modal-title" style={{ color: '#dc2626' }}>Xác nhận hủy phiếu bán hàng</h3>
                </div>
                <button type="button" onClick={() => setCancellingSale(null)} className="btn btn-secondary btn-sm" disabled={cancelLoading}>
                  <X size={15} />
                </button>
              </div>

              <div className="modal-body">
                <div style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 6,
                  padding: '10px 14px',
                  marginBottom: 12,
                  fontSize: 12.5,
                  color: '#991b1b',
                }}>
                  Thao tác hủy sẽ <strong>hoàn trả {cancellingSale.quantity} sản phẩm</strong> vào tồn kho và các lô hàng FIFO, đồng thời trừ <strong>{formatVND(cancellingSale.total_revenue)}</strong> khỏi doanh thu và lợi nhuận.
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Mã giao dịch:</span>
                    <strong style={{ fontFamily: 'monospace' }}>{cancellingSale.transaction_code}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Sản phẩm:</span>
                    <strong>{cancellingSale.product_name}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Số lượng bán:</span>
                    <strong style={{ color: '#0f172a' }}>{cancellingSale.quantity}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748b' }}>Doanh thu ghi nhận:</span>
                    <strong style={{ color: '#0f172a' }}>{formatVND(cancellingSale.total_revenue)}</strong>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: 12.5 }}>Lý do hủy (*):</label>
                  <select
                    className="form-select"
                    style={{ marginBottom: 6, fontSize: 12 }}
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                  >
                    <option value="Khách đổi ý không mua">Khách đổi ý không mua</option>
                    <option value="Ghi nhầm số lượng">Ghi nhầm số lượng</option>
                    <option value="Nhập sai sản phẩm">Nhập sai sản phẩm</option>
                    <option value="Khách trả lại hàng bị lỗi">Khách trả lại hàng bị lỗi</option>
                    <option value="Giao dịch trùng lặp">Giao dịch trùng lặp</option>
                  </select>

                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ghi chú chi tiết lý do..."
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setCancellingSale(null)} className="btn btn-secondary" disabled={cancelLoading}>
                  Đóng
                </button>
                <button type="submit" className="btn btn-danger" disabled={cancelLoading}>
                  {cancelLoading ? 'Đang hủy...' : 'Xác nhận hủy phiếu bán'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
