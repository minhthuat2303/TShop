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
import { getClientCached, setClientCached, clearClientCache } from '@/lib/client-cache';
import { formatCurrency } from '@/lib/formatters';

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
  const [allProducts, setAllProducts] = useState<ProductItem[]>(() => getClientCached('products_all') || []);
  const [categories, setCategories] = useState<any[]>(() => getClientCached('categories') || []);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingProds, setLoadingProds] = useState(() => !getClientCached('products_all'));

  // Mobile POS view tab switcher ('catalog' | 'cart')
  const [mobilePosTab, setMobilePosTab] = useState<'catalog' | 'cart'>('catalog');

  // Selected items list to sell in batch
  const [selectedItems, setSelectedItems] = useState<SelectedSaleItem[]>([]);

  // Submission & feedback states
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sales History State
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
    try {
      const [prodRes, catRes] = await Promise.all([
        fetch('/api/products?status=ACTIVE&limit=300'),
        fetch('/api/categories'),
      ]);

      const prodJson = await prodRes.json();
      const catJson = await catRes.json();

      if (prodJson.success) {
        setAllProducts(prodJson.data);
        setClientCached('products_all', prodJson.data);
      }
      if (catJson.success) {
        setCategories(catJson.data);
        setClientCached('categories', catJson.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingProds(false);
    }
  };

  // Load sales history with filters & pagination
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
        setMobilePosTab('catalog');
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

  // Export Sales History to Excel
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

  const formatVND = (num: number) => formatCurrency(num);

  return (
    <div style={{ width: '100%' }}>
      {/* 1. Date and Top Toolbar */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: 8,
        border: '1px solid var(--border-subtle)',
        padding: '10px 14px',
        marginBottom: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#334155', fontWeight: 600, fontSize: 13 }}>
            <Calendar size={15} color="#64748b" />
            <span>Ngày bán:</span>
          </div>
          <input
            type="date"
            className="form-input"
            style={{ width: 140, height: 34, padding: '2px 8px', fontSize: 12.5 }}
            value={saleDate}
            onChange={(e) => {
              setSaleDate(e.target.value);
              setHistoryStartDate(e.target.value);
              setHistoryEndDate(e.target.value);
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
          marginBottom: 12,
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
          marginBottom: 12,
          fontSize: 13,
        }}>
          <AlertCircle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Mobile Tab Switcher (Visible on Mobile / Tablet < 1024px) */}
      <div className="pos-tabs-bar" style={{
        gap: 6,
        marginBottom: 12,
        backgroundColor: '#f1f5f9',
        padding: 4,
        borderRadius: 8,
        border: '1px solid var(--border-subtle)',
      }}>
        <button
          type="button"
          onClick={() => setMobilePosTab('catalog')}
          className={`btn btn-sm ${mobilePosTab === 'catalog' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ flex: 1, minHeight: 38, fontSize: 13, fontWeight: 600 }}
        >
          <Package size={15} />
          <span>1. Chọn SP ({filteredProducts.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setMobilePosTab('cart')}
          className={`btn btn-sm ${mobilePosTab === 'cart' ? 'btn-primary' : 'btn-secondary'}`}
          style={{
            flex: 1,
            minHeight: 38,
            fontSize: 13,
            fontWeight: 600,
            position: 'relative',
            backgroundColor: mobilePosTab === 'cart' ? undefined : selectedItems.length > 0 ? '#eff6ff' : undefined,
            borderColor: selectedItems.length > 0 ? '#bfdbfe' : undefined,
          }}
        >
          <ShoppingBag size={15} />
          <span>2. Giỏ hàng ({selectedItems.length})</span>
          {selectedItems.length > 0 && (
            <span style={{
              marginLeft: 4,
              backgroundColor: mobilePosTab === 'cart' ? '#ffffff' : '#2563eb',
              color: mobilePosTab === 'cart' ? '#2563eb' : '#ffffff',
              borderRadius: 9999,
              padding: '1px 6px',
              fontSize: 11,
              fontWeight: 700,
            }}>
              {totalQuantity}
            </span>
          )}
        </button>
      </div>

      {/* 2. Main POS Layout: Responsive Grid/Tabs */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
        gap: 14,
        marginBottom: 16,
      }}>
        {/* COLUMN 1: PRODUCT CATALOG */}
        <div
          className={`card pos-panel ${mobilePosTab === 'catalog' ? 'active' : ''}`}
          style={{
            marginBottom: 0,
            minHeight: 480,
            maxHeight: 620,
          }}
        >
          <div className="card-header" style={{ padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Package size={15} color="#475569" />
              <h3 className="card-title" style={{ fontSize: 13.5 }}>Danh mục sản phẩm</h3>
            </div>
            <span style={{ fontSize: 11.5, color: '#64748b' }}>
              {filteredProducts.length} sản phẩm
            </span>
          </div>

          {/* Search & Filter Bar */}
          <div style={{
            padding: '8px 12px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            gap: 8,
            flexDirection: 'column',
          }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: 28, height: 34, fontSize: 12.5 }}
                placeholder="Tìm tên, SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 8, top: 10 }} />
            </div>

            <select
              className="form-select"
              style={{ height: 34, padding: '2px 8px', fontSize: 12.5 }}
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">-- Tất cả danh mục --</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Product Items List (Touch-Friendly) */}
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
                      padding: '10px 12px',
                      borderRadius: 6,
                      border: isSelected ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                      backgroundColor: isOutOfStock ? '#f8fafc' : isSelected ? '#eff6ff' : '#ffffff',
                      cursor: isOutOfStock ? 'not-allowed' : 'pointer',
                      opacity: isOutOfStock ? 0.6 : 1,
                      transition: 'all 0.15s ease',
                      minHeight: 52,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {prod.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 6, marginTop: 2 }}>
                        <span>SKU: {prod.sku}</span>
                        <span>•</span>
                        <span>{prod.product_type_name}</span>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                        {formatVND(prod.current_selling_price)}
                      </div>
                      <div style={{ fontSize: 11, color: isOutOfStock ? '#dc2626' : '#059669', fontWeight: 600 }}>
                        {isOutOfStock ? 'Hết hàng' : `Tồn: ${prod.current_stock}`}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* COLUMN 2: CURRENT CART / SALE BATCH (MOBILE OPTIMIZED) */}
        <div
          className={`card pos-panel ${mobilePosTab === 'cart' ? 'active' : ''}`}
          style={{
            marginBottom: 0,
            minHeight: 480,
          }}
        >
          <div className="card-header" style={{ padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShoppingBag size={15} color="#475569" />
              <h3 className="card-title" style={{ fontSize: 13.5 }}>Giỏ hàng ({selectedItems.length} món)</h3>
            </div>

            {selectedItems.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedItems([])}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: 11.5, padding: '2px 8px', height: 28 }}
              >
                <Trash2 size={12} />
                <span>Xóa hết</span>
              </button>
            )}
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '10px 12px' }}>
            {selectedItems.length === 0 ? (
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94a3b8',
                gap: 8,
                padding: '40px 10px',
              }}>
                <ShoppingBag size={40} strokeWidth={1.5} color="#cbd5e1" />
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Chưa có sản phẩm nào trong giỏ.</div>
                <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
                  Chuyển sang tab <strong>"1. Chọn SP"</strong> để chọn mặt hàng cần bán.
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmitBatchSale} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* Cart Items List */}
                <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedItems.map((item) => {
                    const itemDiscountVND = (item.discountThousand || 0) * 1000;
                    const itemSubtotal = item.quantity * item.unitPrice;
                    const itemTotal = Math.max(0, itemSubtotal - itemDiscountVND);

                    return (
                      <div
                        key={item.productId}
                        style={{
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 8,
                          padding: '10px 12px',
                          backgroundColor: '#fafafa',
                        }}
                      >
                        {/* Title & Delete button */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{item.name}</div>
                            <div style={{ fontSize: 11, color: '#64748b' }}>
                              SKU: {item.sku} • Đơn giá: <strong>{formatVND(item.unitPrice)}</strong>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.productId)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px', width: 28, height: 28, color: '#ef4444', borderColor: '#fecaca', flexShrink: 0 }}
                            title="Xóa khỏi giỏ"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        {/* Controls: Stepper, Discount, Subtotal */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: 8,
                          paddingTop: 6,
                          borderTop: '1px solid #f1f5f9',
                        }}>
                          {/* Stepper with >= 40px Touch target */}
                          <div className="stepper" style={{ height: 38 }}>
                            <button
                              type="button"
                              className="stepper-btn"
                              onClick={() => handleQuantityChange(item.productId, item.quantity - 1)}
                              aria-label="Giảm số lượng"
                            >
                              <Minus size={14} />
                            </button>
                            <input
                              type="number"
                              className="stepper-input"
                              value={item.quantity}
                              min="1"
                              max={item.currentStock}
                              onChange={(e) => handleQuantityChange(item.productId, parseInt(e.target.value) || 1)}
                            />
                            <button
                              type="button"
                              className="stepper-btn"
                              onClick={() => handleQuantityChange(item.productId, item.quantity + 1)}
                              aria-label="Tăng số lượng"
                            >
                              <Plus size={14} />
                            </button>
                          </div>

                          {/* Discount Input */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 11, color: '#64748b' }}>Giảm (kđ):</span>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              className="form-input"
                              style={{
                                width: 65,
                                height: 34,
                                padding: '2px 4px',
                                fontSize: 12,
                                textAlign: 'right',
                                fontWeight: 600,
                                color: item.discountThousand > 0 ? '#dc2626' : undefined,
                              }}
                              placeholder="0"
                              value={item.discountThousand === 0 ? '' : item.discountThousand}
                              onChange={(e) => handleDiscountChange(item.productId, e.target.value)}
                              title="Nhập 5 = giảm 5.000đ"
                            />
                          </div>

                          {/* Subtotal */}
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: 13.5, color: '#1d4ed8' }}>
                              {formatVND(itemTotal)}
                            </div>
                            {item.discountThousand > 0 && (
                              <div style={{ fontSize: 10, color: '#dc2626' }}>
                                -{formatCurrency(itemDiscountVND)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Calculation Summary Box */}
                <div style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
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
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>TỔNG CỘNG:</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: '#16a34a' }}>
                      {formatVND(finalTotalRevenue)}
                    </span>
                  </div>
                </div>

                {/* 100% Width Submit Button with >= 44px Touch target */}
                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  style={{ width: '100%', minHeight: 46, fontSize: 14.5, fontWeight: 700 }}
                  disabled={submitting || selectedItems.length === 0}
                >
                  {submitting ? 'Đang lưu giao dịch...' : `XÁC NHẬN GHI BÁN (${selectedItems.length} SP)`}
                  {!submitting && <ArrowRight size={16} />}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* 3. LỊCH SỬ BÁN HÀNG (RESPONSIVE TABLE & FILTERS) */}
      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: 10, padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16} color="#475569" />
            <div>
              <h3 className="card-title" style={{ fontSize: 14 }}>Lịch sử bán hàng</h3>
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
              <span>{exportingSales ? 'Đang xuất...' : 'Xuất Excel'}</span>
            </button>
          </div>
        </div>

        {/* History Filters */}
        <div style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 8,
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>Từ:</span>
            <input
              type="date"
              className="form-input"
              style={{ height: 32, fontSize: 12 }}
              value={historyStartDate}
              onChange={(e) => setHistoryStartDate(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>Đến:</span>
            <input
              type="date"
              className="form-input"
              style={{ height: 32, fontSize: 12 }}
              value={historyEndDate}
              onChange={(e) => setHistoryEndDate(e.target.value)}
            />
          </div>

          <select
            className="form-select"
            style={{ height: 32, fontSize: 12 }}
            value={historyStatus}
            onChange={(e) => setHistoryStatus(e.target.value)}
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="COMPLETED">Thành công</option>
            <option value="CANCELLED">Đã hủy</option>
          </select>

          <div style={{ position: 'relative' }}>
            <input
              type="text"
              className="form-input"
              style={{ height: 32, paddingLeft: 26, fontSize: 12 }}
              placeholder="Mã phiếu / SKU..."
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
            />
            <Search size={12} color="#94a3b8" style={{ position: 'absolute', left: 8, top: 10 }} />
          </div>
        </div>

        {/* History Table Container (Isolated Scroll) */}
        <div className="table-container" style={{ maxHeight: 420 }}>
          <table className="data-table" style={{ fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={{ width: 110 }}>Mã GD</th>
                <th>Thời gian</th>
                <th>Sản phẩm</th>
                <th className="text-right">SL</th>
                <th className="text-right">Đơn giá</th>
                <th className="text-right">Giảm</th>
                <th className="text-right">Thành tiền</th>
                <th className="text-center">Trạng thái</th>
                <th className="text-center" style={{ width: 90 }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loadingSales ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '25px 0', color: '#64748b' }}>
                    Đang tải lịch sử bán hàng...
                  </td>
                </tr>
              ) : recentSales.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8' }}>
                    Không tìm thấy giao dịch nào trong khoảng thời gian này.
                  </td>
                </tr>
              ) : (
                recentSales.map((sale) => (
                  <tr key={sale.id} style={{ opacity: sale.status === 'CANCELLED' ? 0.6 : 1 }}>
                    <td style={{ fontWeight: 600, fontFamily: 'monospace', color: '#1e3a8a' }}>
                      {sale.transaction_code}
                    </td>
                    <td style={{ fontSize: 11.5, color: '#64748b', whiteSpace: 'nowrap' }}>
                      {sale.sale_date}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{sale.product_name}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>SKU: {sale.sku}</div>
                    </td>
                    <td className="text-right" style={{ fontWeight: 700 }}>{sale.quantity}</td>
                    <td className="text-right">{formatVND(sale.unit_price)}</td>
                    <td className="text-right" style={{ color: sale.discount_amount > 0 ? '#dc2626' : '#64748b' }}>
                      {sale.discount_amount > 0 ? `-${formatVND(sale.discount_amount)}` : '-'}
                    </td>
                    <td className="text-right" style={{ fontWeight: 700, color: sale.status === 'CANCELLED' ? '#64748b' : '#1d4ed8' }}>
                      {formatVND(sale.total_amount)}
                    </td>
                    <td className="text-center">
                      <span className={`badge ${sale.status === 'COMPLETED' ? 'badge-success' : 'badge-danger'}`}>
                        {sale.status === 'COMPLETED' ? 'Thành công' : 'Đã hủy'}
                      </span>
                    </td>
                    <td className="text-center">
                      {sale.status === 'COMPLETED' && user?.role === 'ADMIN' && (
                        <button
                          onClick={() => setCancellingSale(sale)}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '2px 6px', fontSize: 11, color: '#dc2626', borderColor: '#fecaca' }}
                          title="Hủy phiếu bán này"
                        >
                          <Ban size={12} />
                          <span>Hủy</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CANCELLATION MODAL */}
      {cancellingSale && (
        <div className="modal-backdrop" onClick={() => setCancellingSale(null)}>
          <div className="modal-content" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleConfirmCancelSale}>
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#dc2626' }}>
                  <AlertTriangle size={18} />
                  <h3 className="modal-title">Hủy phiếu bán hàng</h3>
                </div>
                <button type="button" onClick={() => setCancellingSale(null)} className="btn btn-secondary btn-sm">
                  <X size={16} />
                </button>
              </div>

              <div className="modal-body">
                <p style={{ fontSize: 13, color: '#334155', marginBottom: 12 }}>
                  Bạn có chắc chắn muốn hủy phiếu <strong>[{cancellingSale.transaction_code}]</strong> của sản phẩm <strong>{cancellingSale.product_name}</strong>?
                </p>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12, backgroundColor: '#fef2f2', padding: 8, borderRadius: 6 }}>
                  Hành động này sẽ hoàn trả lại <strong>{cancellingSale.quantity} sản phẩm</strong> vào kho hàng và xóa doanh thu tương ứng.
                </div>

                <div className="form-group">
                  <label className="form-label">Lý do hủy (*):</label>
                  <input
                    type="text"
                    className="form-input"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" onClick={() => setCancellingSale(null)} className="btn btn-secondary">
                  Đóng
                </button>
                <button type="submit" className="btn btn-danger" disabled={cancelLoading}>
                  {cancelLoading ? 'Đang hủy...' : 'Xác nhận hủy phiếu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
