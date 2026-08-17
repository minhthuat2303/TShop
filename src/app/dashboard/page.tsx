'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  DollarSign, 
  ShoppingBag, 
  Boxes, 
  TrendingUp, 
  Search, 
  Download, 
  ArrowUpDown, 
  Calendar,
  AlertTriangle,
  RefreshCw,
  Filter,
  RotateCcw
} from 'lucide-react';
import { DateFilterPeriod } from '@/lib/date-utils';

interface Category {
  id: number;
  name: string;
}

interface ProductType {
  id: number;
  category_id: number;
  name: string;
}

interface ProductOption {
  id: number;
  sku: string;
  name: string;
  category_id: number;
  product_type_id: number;
}

// ---------------------------------------------------------------------------
// 1. PURE SVG DUAL PAIRED BAR CHART (FOR CHART 1: REVENUE & PROFIT)
// ---------------------------------------------------------------------------
interface BarSeriesDef {
  key: string;
  label: string;
  color: string;
  isCurrency?: boolean;
}

interface BarChartProps {
  title: string;
  data: any[];
  series: BarSeriesDef[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  height?: number;
}

function ProfessionalBarChart({
  title,
  data,
  series,
  loading,
  error,
  onRetry,
  height = 170,
}: BarChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { maxY, minY } = useMemo(() => {
    if (!data || data.length === 0) return { maxY: 100, minY: 0 };
    let max = 0;
    let min = 0;
    data.forEach((d) => {
      series.forEach((s) => {
        const val = Number(d[s.key]) || 0;
        if (val > max) max = val;
        if (val < min) min = val;
      });
    });
    const safeMax = max === 0 ? 100 : max * 1.15;
    return { maxY: safeMax, minY: Math.min(0, min) };
  }, [data, series]);

  const padding = { top: 14, right: 14, bottom: 26, left: 55 };
  const svgWidth = 600;
  const svgHeight = height;
  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;

  const getY = (value: number) => {
    const range = maxY - minY || 1;
    const normalized = (value - minY) / range;
    return padding.top + chartHeight - normalized * chartHeight;
  };

  const formatYAxis = (val: number) => {
    if (Math.abs(val) >= 1_000_000) {
      return (val / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + 'tr';
    }
    if (Math.abs(val) >= 1_000) {
      return (val / 1_000).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + 'k';
    }
    return val.toLocaleString('vi-VN');
  };

  const yTicks = useMemo(() => {
    const ticks = [];
    const step = (maxY - minY) / 3;
    for (let i = 0; i <= 3; i++) {
      ticks.push(minY + step * i);
    }
    return ticks;
  }, [maxY, minY]);

  const slotWidth = chartWidth / Math.max(1, data.length);
  const barWidth = Math.min(18, Math.max(4, (slotWidth * 0.7) / series.length));

  return (
    <div className="card" style={{ marginBottom: 0, position: 'relative', overflow: 'hidden' }}>
      <div className="card-header" style={{ padding: '8px 12px', flexWrap: 'wrap', gap: 6 }}>
        <h3 className="card-title" style={{ fontSize: 13 }}>{title}</h3>
        <div style={{ display: 'flex', gap: 10, fontSize: 11.5, alignItems: 'center' }}>
          {series.map((s) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 9, height: 9, backgroundColor: s.color, borderRadius: 2 }}></span>
              <span style={{ color: '#475569', fontWeight: 500 }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card-body" style={{ padding: '6px 10px', position: 'relative' }}>
        {loading && (
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#2563eb', fontWeight: 600 }}>
              <RefreshCw size={13} className="animate-spin" />
              <span>Đang tải...</span>
            </div>
          </div>
        )}

        {error && !loading && (
          <div style={{ textAlign: 'center', padding: '35px 15px', color: '#dc2626' }}>
            <AlertTriangle size={20} style={{ margin: '0 auto 6px' }} />
            <div style={{ fontSize: 12, fontWeight: 600 }}>Không thể tải biểu đồ.</div>
            <button onClick={onRetry} className="btn btn-secondary btn-sm" style={{ marginTop: 6, fontSize: 11 }}>
              Thử lại
            </button>
          </div>
        )}

        {!error && !loading && (!data || data.length === 0) && (
          <div style={{ textAlign: 'center', padding: '40px 15px', color: '#94a3b8', fontSize: 12 }}>
            Chưa có dữ liệu trong khoảng thời gian đã chọn.
          </div>
        )}

        {!error && data && data.length > 0 && (
          <div style={{ position: 'relative', width: '100%', userSelect: 'none' }}>
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              style={{ width: '100%', height: 'auto', display: 'block' }}
              onMouseLeave={() => setHoverIndex(null)}
            >
              {/* Y Gridlines */}
              {yTicks.map((tick, i) => {
                const y = getY(tick);
                return (
                  <g key={i}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={svgWidth - padding.right}
                      y2={y}
                      stroke="#e2e8f0"
                      strokeDasharray={i === 0 ? undefined : '3,3'}
                      strokeWidth={1}
                    />
                    <text
                      x={padding.left - 6}
                      y={y + 3}
                      textAnchor="end"
                      fontSize={9.5}
                      fill="#64748b"
                      fontFamily="sans-serif"
                    >
                      {formatYAxis(tick)}
                    </text>
                  </g>
                );
              })}

              {/* X Labels and Bars */}
              {data.map((d, idx) => {
                const slotX = padding.left + idx * slotWidth;
                const centerX = slotX + slotWidth / 2;
                const totalBarWidth = series.length * barWidth + (series.length - 1) * 2;
                const startBarX = centerX - totalBarWidth / 2;

                const total = data.length;
                let showLabel = true;
                if (total > 15 && idx % Math.ceil(total / 8) !== 0 && idx !== total - 1) {
                  showLabel = false;
                }

                return (
                  <g key={idx}>
                    {/* Hover column background highlight */}
                    {hoverIndex === idx && (
                      <rect
                        x={slotX + 1}
                        y={padding.top}
                        width={slotWidth - 2}
                        height={chartHeight}
                        fill="#f1f5f9"
                        rx={3}
                      />
                    )}

                    {/* Bars */}
                    {series.map((s, sIdx) => {
                      const val = Math.max(0, Number(d[s.key]) || 0);
                      const barY = getY(val);
                      const bH = Math.max(val > 0 ? 2 : 0, getY(0) - barY);
                      const bX = startBarX + sIdx * (barWidth + 2);

                      return (
                        <rect
                          key={s.key}
                          x={bX}
                          y={barY}
                          width={barWidth}
                          height={bH}
                          fill={s.color}
                          rx={1.5}
                          style={{ transition: 'height 0.2s ease, y 0.2s ease' }}
                        />
                      );
                    })}

                    {/* X Label */}
                    {showLabel && (
                      <text
                        x={centerX}
                        y={svgHeight - 6}
                        textAnchor="middle"
                        fontSize={9.5}
                        fill="#64748b"
                        fontFamily="sans-serif"
                      >
                        {d.label}
                      </text>
                    )}

                    {/* Transparent Click Overlay */}
                    <rect
                      x={slotX}
                      y={padding.top}
                      width={slotWidth}
                      height={chartHeight}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoverIndex(idx)}
                    />
                  </g>
                );
              })}
            </svg>

            {/* Tooltip */}
            {hoverIndex !== null && data[hoverIndex] && (
              <div
                style={{
                  position: 'absolute',
                  top: 6,
                  left: `${((padding.left + hoverIndex * slotWidth + slotWidth / 2) / svgWidth) * 100}%`,
                  transform: hoverIndex > data.length * 0.65 ? 'translateX(-100%)' : 'translateX(0%)',
                  backgroundColor: '#0f172a',
                  color: '#ffffff',
                  padding: '6px 10px',
                  borderRadius: 5,
                  fontSize: 11.5,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  pointerEvents: 'none',
                  zIndex: 20,
                  minWidth: 130,
                }}
              >
                <div style={{ fontWeight: 700, color: '#94a3b8', borderBottom: '1px solid #334155', paddingBottom: 3, marginBottom: 4 }}>
                  {data[hoverIndex].fullDate || data[hoverIndex].label}
                </div>
                {series.map((s) => (
                  <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                    <span style={{ color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 7, height: 7, backgroundColor: s.color, borderRadius: 2 }}></span>
                      {s.label}:
                    </span>
                    <strong style={{ color: '#ffffff' }}>
                      {(Number(data[hoverIndex][s.key]) || 0).toLocaleString('vi-VN')} đ
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. PURE SVG COMPACT LINE CHART (FOR CHART 2: INVENTORY & MOVEMENTS)
// ---------------------------------------------------------------------------
interface LineSeriesDef {
  key: string;
  label: string;
  color: string;
  unit?: string;
}

interface CompactLineChartProps {
  title: string;
  data: any[];
  series: LineSeriesDef[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  height?: number;
}

function CompactLineChart({
  title,
  data,
  series,
  loading,
  error,
  onRetry,
  height = 170,
}: CompactLineChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { maxY, minY } = useMemo(() => {
    if (!data || data.length === 0) return { maxY: 100, minY: 0 };
    let max = 0;
    let min = 0;
    data.forEach((d) => {
      series.forEach((s) => {
        const val = Number(d[s.key]) || 0;
        if (val > max) max = val;
        if (val < min) min = val;
      });
    });
    const safeMax = max === 0 ? 100 : max * 1.15;
    return { maxY: safeMax, minY: Math.min(0, min) };
  }, [data, series]);

  const padding = { top: 14, right: 14, bottom: 26, left: 45 };
  const svgWidth = 600;
  const svgHeight = height;
  const chartWidth = svgWidth - padding.left - padding.right;
  const chartHeight = svgHeight - padding.top - padding.bottom;

  const getX = (index: number) => {
    if (data.length <= 1) return padding.left + chartWidth / 2;
    return padding.left + (index / (data.length - 1)) * chartWidth;
  };

  const getY = (value: number) => {
    const range = maxY - minY || 1;
    const normalized = (value - minY) / range;
    return padding.top + chartHeight - normalized * chartHeight;
  };

  const yTicks = useMemo(() => {
    const ticks = [];
    const step = (maxY - minY) / 3;
    for (let i = 0; i <= 3; i++) {
      ticks.push(minY + step * i);
    }
    return ticks;
  }, [maxY, minY]);

  return (
    <div className="card" style={{ marginBottom: 0, position: 'relative', overflow: 'hidden' }}>
      <div className="card-header" style={{ padding: '8px 12px', flexWrap: 'wrap', gap: 6 }}>
        <h3 className="card-title" style={{ fontSize: 13 }}>{title}</h3>
        <div style={{ display: 'flex', gap: 10, fontSize: 11.5, alignItems: 'center' }}>
          {series.map((s) => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 2.5, backgroundColor: s.color, borderRadius: 2 }}></span>
              <span style={{ color: '#475569', fontWeight: 500 }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card-body" style={{ padding: '6px 10px', position: 'relative' }}>
        {loading && (
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#2563eb', fontWeight: 600 }}>
              <RefreshCw size={13} className="animate-spin" />
              <span>Đang tải...</span>
            </div>
          </div>
        )}

        {error && !loading && (
          <div style={{ textAlign: 'center', padding: '35px 15px', color: '#dc2626' }}>
            <AlertTriangle size={20} style={{ margin: '0 auto 6px' }} />
            <div style={{ fontSize: 12, fontWeight: 600 }}>Không thể tải biểu đồ.</div>
            <button onClick={onRetry} className="btn btn-secondary btn-sm" style={{ marginTop: 6, fontSize: 11 }}>
              Thử lại
            </button>
          </div>
        )}

        {!error && !loading && (!data || data.length === 0) && (
          <div style={{ textAlign: 'center', padding: '40px 15px', color: '#94a3b8', fontSize: 12 }}>
            Chưa có dữ liệu trong khoảng thời gian đã chọn.
          </div>
        )}

        {!error && data && data.length > 0 && (
          <div style={{ position: 'relative', width: '100%', userSelect: 'none' }}>
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              style={{ width: '100%', height: 'auto', display: 'block' }}
              onMouseLeave={() => setHoverIndex(null)}
            >
              {/* Y Gridlines */}
              {yTicks.map((tick, i) => {
                const y = getY(tick);
                return (
                  <g key={i}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={svgWidth - padding.right}
                      y2={y}
                      stroke="#e2e8f0"
                      strokeDasharray={i === 0 ? undefined : '3,3'}
                      strokeWidth={1}
                    />
                    <text
                      x={padding.left - 5}
                      y={y + 3}
                      textAnchor="end"
                      fontSize={9.5}
                      fill="#64748b"
                      fontFamily="sans-serif"
                    >
                      {Math.round(tick)}
                    </text>
                  </g>
                );
              })}

              {/* X Labels */}
              {data.map((d, idx) => {
                const total = data.length;
                let show = true;
                if (total > 15 && idx % Math.ceil(total / 8) !== 0 && idx !== total - 1) {
                  show = false;
                }
                if (!show) return null;
                return (
                  <text
                    key={idx}
                    x={getX(idx)}
                    y={svgHeight - 6}
                    textAnchor="middle"
                    fontSize={9.5}
                    fill="#64748b"
                    fontFamily="sans-serif"
                  >
                    {d.label}
                  </text>
                );
              })}

              {/* Series Lines */}
              {series.map((s) => {
                const points = data.map((d, idx) => `${getX(idx)},${getY(Number(d[s.key]) || 0)}`).join(' ');
                return (
                  <g key={s.key}>
                    <polyline
                      fill="none"
                      stroke={s.color}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={points}
                    />
                    {data.length <= 31 && data.map((d, idx) => (
                      <circle
                        key={idx}
                        cx={getX(idx)}
                        cy={getY(Number(d[s.key]) || 0)}
                        r={hoverIndex === idx ? 4 : 2}
                        fill="#ffffff"
                        stroke={s.color}
                        strokeWidth={1.8}
                      />
                    ))}
                  </g>
                );
              })}

              {/* Active Hover Crosshair Line */}
              {hoverIndex !== null && (
                <line
                  x1={getX(hoverIndex)}
                  y1={padding.top}
                  x2={getX(hoverIndex)}
                  y2={svgHeight - padding.bottom}
                  stroke="#94a3b8"
                  strokeWidth={1.2}
                  strokeDasharray="2,2"
                />
              )}

              {/* Transparent Overlay */}
              {data.map((_, idx) => {
                const x = getX(idx);
                const stepWidth = chartWidth / Math.max(1, data.length - 1);
                const rectX = Math.max(padding.left, x - stepWidth / 2);
                return (
                  <rect
                    key={idx}
                    x={rectX}
                    y={padding.top}
                    width={stepWidth}
                    height={chartHeight}
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHoverIndex(idx)}
                  />
                );
              })}
            </svg>

            {/* Tooltip */}
            {hoverIndex !== null && data[hoverIndex] && (
              <div
                style={{
                  position: 'absolute',
                  top: 6,
                  left: `${(getX(hoverIndex) / svgWidth) * 100}%`,
                  transform: getX(hoverIndex) > svgWidth * 0.65 ? 'translateX(-100%)' : 'translateX(0%)',
                  backgroundColor: '#0f172a',
                  color: '#ffffff',
                  padding: '6px 10px',
                  borderRadius: 5,
                  fontSize: 11.5,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  pointerEvents: 'none',
                  zIndex: 20,
                  minWidth: 130,
                }}
              >
                <div style={{ fontWeight: 700, color: '#94a3b8', borderBottom: '1px solid #334155', paddingBottom: 3, marginBottom: 4 }}>
                  {data[hoverIndex].fullDate || data[hoverIndex].label}
                </div>
                {series.map((s) => (
                  <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                    <span style={{ color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 7, height: 7, backgroundColor: s.color, borderRadius: 2 }}></span>
                      {s.label}:
                    </span>
                    <strong style={{ color: '#ffffff' }}>
                      {(Number(data[hoverIndex][s.key]) || 0).toLocaleString('vi-VN')} {s.unit || 'SP'}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. MAIN DASHBOARD PAGE
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  const [period, setPeriod] = useState<DateFilterPeriod>('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  const [sortBy, setSortBy] = useState<string>('revenue');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [categories, setCategories] = useState<Category[]>([]);
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [allProducts, setAllProducts] = useState<ProductOption[]>([]);

  const [summary, setSummary] = useState<any>(null);
  const [chart1Data, setChart1Data] = useState<any[]>([]);
  const [chart2Data, setChart2Data] = useState<any[]>([]);
  const [tableData, setTableData] = useState<any>(null);

  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingChart1, setLoadingChart1] = useState(true);
  const [loadingChart2, setLoadingChart2] = useState(true);
  const [loadingTable, setLoadingTable] = useState(true);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [errorChart1, setErrorChart1] = useState<string | null>(null);
  const [errorChart2, setErrorChart2] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/categories')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setCategories(json.data);
      });

    fetch('/api/products?status=ACTIVE&limit=300')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setAllProducts(json.data);
      });
  }, []);

  useEffect(() => {
    const url = selectedCategory ? `/api/product-types?categoryId=${selectedCategory}` : '/api/product-types';
    fetch(url)
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setProductTypes(json.data);
      });
  }, [selectedCategory]);

  const availableProducts = useMemo(() => {
    return allProducts.filter((p) => {
      if (selectedType) return String(p.product_type_id) === String(selectedType);
      if (selectedCategory) return String(p.category_id) === String(selectedCategory);
      return true;
    });
  }, [allProducts, selectedCategory, selectedType]);

  const getFilterParams = useCallback(() => {
    let params = `period=${period}`;
    if (period === 'custom' && customStart && customEnd) {
      params += `&startDate=${customStart}&endDate=${customEnd}`;
    }
    if (selectedCategory) params += `&categoryId=${selectedCategory}`;
    if (selectedType) params += `&productTypeId=${selectedType}`;
    if (selectedProduct) params += `&productId=${selectedProduct}`;
    return params;
  }, [period, customStart, customEnd, selectedCategory, selectedType, selectedProduct]);

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const res = await fetch(`/api/dashboard/summary?${getFilterParams()}`);
      const json = await res.json();
      if (json.success) setSummary(json.data);
    } catch (err) {
      console.error('Failed to load summary:', err);
    } finally {
      setLoadingSummary(false);
    }
  }, [getFilterParams]);

  const loadChart1 = useCallback(async () => {
    setLoadingChart1(true);
    setErrorChart1(null);
    try {
      const res = await fetch(`/api/dashboard/charts/revenue-profit?${getFilterParams()}`);
      const json = await res.json();
      if (json.success) {
        setChart1Data(json.data || []);
      } else {
        setErrorChart1(json.error?.message || 'Lỗi tải biểu đồ doanh thu.');
      }
    } catch (err: any) {
      setErrorChart1(err.message || 'Lỗi kết nối.');
    } finally {
      setLoadingChart1(false);
    }
  }, [getFilterParams]);

  const loadChart2 = useCallback(async () => {
    setLoadingChart2(true);
    setErrorChart2(null);
    try {
      const res = await fetch(`/api/dashboard/charts/inventory?${getFilterParams()}`);
      const json = await res.json();
      if (json.success) {
        setChart2Data(json.data || []);
      } else {
        setErrorChart2(json.error?.message || 'Lỗi tải biểu đồ tồn kho.');
      }
    } catch (err: any) {
      setErrorChart2(err.message || 'Lỗi kết nối.');
    } finally {
      setLoadingChart2(false);
    }
  }, [getFilterParams]);

  const loadTable = useCallback(async () => {
    setLoadingTable(true);
    try {
      let tableParams = `${getFilterParams()}&sortBy=${sortBy}&sortOrder=${sortOrder}`;
      if (searchQuery) tableParams += `&q=${encodeURIComponent(searchQuery)}`;

      const res = await fetch(`/api/dashboard/aggregate-table?${tableParams}`);
      const json = await res.json();
      if (json.success) {
        setTableData(json.data);
      }
    } catch (err) {
      console.error('Failed to load table:', err);
    } finally {
      setLoadingTable(false);
    }
  }, [getFilterParams, sortBy, sortOrder, searchQuery]);

  useEffect(() => {
    loadSummary();
    loadChart1();
    loadChart2();
    loadTable();
  }, [loadSummary, loadChart1, loadChart2, loadTable]);

  const handlePeriodChange = (newPeriod: DateFilterPeriod) => {
    setPeriod(newPeriod);
    if (newPeriod !== 'custom') {
      setShowCustomPicker(false);
    } else {
      setShowCustomPicker(true);
    }
  };

  const handleResetFilters = () => {
    setSelectedCategory('');
    setSelectedType('');
    setSelectedProduct('');
    setSearchQuery('');
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  // Safe direct Excel Blob download (Requirement 3)
  const handleExportExcel = async () => {
    if (exportingExcel) return;
    setExportingExcel(true);
    try {
      const url = `/api/dashboard/export-excel?${getFilterParams()}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Lỗi xuất file Excel');
      }
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `Thong_ke_kinh_doanh_shop_${period}_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (e: any) {
      console.error('Export error:', e);
      window.location.href = `/api/dashboard/export-excel?${getFilterParams()}`;
    } finally {
      setExportingExcel(false);
    }
  };

  const formatVND = (num: number) => (num || 0).toLocaleString('vi-VN') + ' đ';
  const hasActiveCascadingFilter = Boolean(selectedCategory || selectedType || selectedProduct);

  return (
    <div>
      {/* 1. SHARED CASCADING FILTER TOOLBAR */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: 8,
        border: '1px solid var(--border-subtle)',
        padding: '10px 16px',
        marginBottom: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        {/* Row 1: Time Period Bar */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <Calendar size={15} color="#64748b" style={{ marginRight: 2 }} />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#475569', marginRight: 2 }}>Kỳ:</span>

            {[
              { key: 'today', label: 'Hôm nay' },
              { key: 'yesterday', label: 'Hôm qua' },
              { key: '7days', label: '7 ngày' },
              { key: '30days', label: '30 ngày' },
              { key: 'this_month', label: 'Tháng này' },
              { key: 'last_month', label: 'Tháng trước' },
              { key: 'this_quarter', label: 'Quý này' },
              { key: 'this_year', label: 'Năm nay' },
              { key: 'custom', label: 'Tùy chọn' },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => handlePeriodChange(item.key as DateFilterPeriod)}
                className={`btn btn-sm ${period === item.key ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '3px 8px', fontSize: 12 }}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => { loadSummary(); loadChart1(); loadChart2(); loadTable(); }}
              className="btn btn-secondary btn-sm"
              title="Làm mới toàn bộ Dashboard"
            >
              <RefreshCw size={13} className={loadingSummary ? 'animate-spin' : ''} />
              <span>Làm mới</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="btn btn-success btn-sm"
              disabled={exportingExcel}
              title="Xuất dữ liệu thống kê ra file Excel .xlsx"
            >
              <Download size={13} />
              <span>{exportingExcel ? 'Đang xuất...' : 'Xuất Excel'}</span>
            </button>
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {showCustomPicker && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            backgroundColor: '#eff6ff',
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid #bfdbfe',
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1e3a8a' }}>Từ ngày:</span>
            <input
              type="date"
              className="form-input"
              style={{ width: 145, padding: '2px 6px', height: 28, fontSize: 12 }}
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
            />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#1e3a8a' }}>Đến ngày:</span>
            <input
              type="date"
              className="form-input"
              style={{ width: 145, padding: '2px 6px', height: 28, fontSize: 12 }}
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
            />
            <button
              onClick={() => { loadSummary(); loadChart1(); loadChart2(); loadTable(); }}
              className="btn btn-primary btn-sm"
              style={{ padding: '2px 10px', fontSize: 12 }}
              disabled={!customStart || !customEnd}
            >
              Áp dụng
            </button>
          </div>
        )}

        {/* Row 2: Cascading Filters Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          paddingTop: 8,
          borderTop: '1px solid var(--border-subtle)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 600, color: '#475569' }}>
            <Filter size={14} color="#2563eb" />
            <span>Lọc:</span>
          </div>

          <select
            className="form-select"
            style={{ height: 30, fontSize: 12, width: 160 }}
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              setSelectedType('');
              setSelectedProduct('');
            }}
          >
            <option value="">[Tất cả Danh mục]</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            className="form-select"
            style={{ height: 30, fontSize: 12, width: 165 }}
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value);
              setSelectedProduct('');
            }}
          >
            <option value="">[Tất cả Loại SP]</option>
            {productTypes
              .filter((pt) => !selectedCategory || String(pt.category_id) === String(selectedCategory))
              .map((pt) => (
                <option key={pt.id} value={pt.id}>{pt.name}</option>
              ))}
          </select>

          <select
            className="form-select"
            style={{ height: 30, fontSize: 12, width: 210 }}
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
          >
            <option value="">[Tất cả Sản phẩm]</option>
            {availableProducts.map((p) => (
              <option key={p.id} value={p.id}>[{p.sku}] {p.name}</option>
            ))}
          </select>

          {hasActiveCascadingFilter && (
            <button
              onClick={handleResetFilters}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: 11.5, padding: '2px 8px', height: 30 }}
              title="Đặt lại bộ lọc về mặc định"
            >
              <RotateCcw size={12} />
              <span>Xóa lọc</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. KPI Summary Cards Grid */}
      <div className="stats-grid" style={{ marginBottom: 12 }}>
        <div className="stat-card" style={{ borderLeft: '4px solid #2563eb', padding: '10px 14px' }}>
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
            <span>DOANH THU ({summary?.periodLabel || 'Kỳ này'})</span>
            <DollarSign size={15} color="#2563eb" />
          </div>
          <div className="stat-value" style={{ color: '#1d4ed8', fontSize: 18 }}>{formatVND(summary?.revenue || 0)}</div>
          <div className="stat-sub" style={{ fontSize: 11 }}>{summary?.salesCount || 0} lượt bán thành công</div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid #16a34a', padding: '10px 14px' }}>
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
            <span>LỢI NHUẬN GỘP</span>
            <TrendingUp size={15} color="#16a34a" />
          </div>
          <div className="stat-value" style={{ color: '#15803d', fontSize: 18 }}>{formatVND(summary?.profit || 0)}</div>
          <div className="stat-sub" style={{ fontSize: 11 }}>
            Tỷ suất: {summary?.revenue > 0 ? ((summary.profit / summary.revenue) * 100).toFixed(1) : 0}%
          </div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid #7c3aed', padding: '10px 14px' }}>
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
            <span>SỐ LƯỢNG ĐÃ BÁN</span>
            <ShoppingBag size={15} color="#7c3aed" />
          </div>
          <div className="stat-value" style={{ color: '#6d28d9', fontSize: 18 }}>
            {(summary?.soldQuantity || 0).toLocaleString('vi-VN')} <span style={{ fontSize: 13, fontWeight: 500 }}>sản phẩm</span>
          </div>
          <div className="stat-sub" style={{ fontSize: 11 }}>Trong kỳ báo cáo</div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid #ea580c', padding: '10px 14px' }}>
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
            <span>TỒN KHO HIỆN TẠI</span>
            <Boxes size={15} color="#ea580c" />
          </div>
          <div className="stat-value" style={{ color: '#c2410c', fontSize: 18 }}>
            {(summary?.currentTotalStock || 0).toLocaleString('vi-VN')} <span style={{ fontSize: 13, fontWeight: 500 }}>món</span>
          </div>
          <div className="stat-sub" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
            {summary?.lowStockCount > 0 ? (
              <span style={{ color: '#dc2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 2 }}>
                <AlertTriangle size={11} /> {summary.lowStockCount} loại sắp hết
              </span>
            ) : (
              'Mức tồn an toàn'
            )}
          </div>
        </div>

        <div className="stat-card" style={{ borderLeft: '4px solid #0891b2', padding: '10px 14px' }}>
          <div className="stat-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
            <span>GIÁ TRỊ TỒN KHO</span>
            <Boxes size={15} color="#0891b2" />
          </div>
          <div className="stat-value" style={{ color: '#0e7490', fontSize: 18 }}>{formatVND(summary?.stockValuation || 0)}</div>
          <div className="stat-sub" style={{ fontSize: 11 }}>Theo giá vốn FIFO các lô tồn</div>
        </div>
      </div>

      {/* 3. COMPACT 2-CHART SECTION (REQUIREMENTS 1 & 2) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
        gap: 12,
        marginBottom: 16,
      }}>
        {/* CHART 1: DOANH THU & LỢI NHUẬN (BAR CHART — DUAL BARS) */}
        <ProfessionalBarChart
          title="Doanh thu & Lợi nhuận"
          data={chart1Data}
          series={[
            { key: 'revenue', label: 'Doanh thu', color: '#2563eb', isCurrency: true },
            { key: 'profit', label: 'Lợi nhuận', color: '#16a34a', isCurrency: true },
          ]}
          loading={loadingChart1}
          error={errorChart1}
          onRetry={loadChart1}
          height={170}
        />

        {/* CHART 2: TỒN KHO & BIẾN ĐỘNG HÀNG HÓA (COMPACT LINE CHART) */}
        <CompactLineChart
          title="Tồn kho & Biến động hàng hóa"
          data={chart2Data}
          series={[
            { key: 'stock', label: 'Tồn kho', color: '#4f46e5', unit: 'SP' },
            { key: 'purchase', label: 'Nhập kho', color: '#059669', unit: 'SP' },
            { key: 'sales', label: 'Bán hàng', color: '#d97706', unit: 'SP' },
          ]}
          loading={loadingChart2}
          error={errorChart2}
          onRetry={loadChart2}
          height={170}
        />
      </div>

      {/* 4. MASTER AGGREGATE TABLE CONTAINER */}
      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: 10, padding: '10px 14px' }}>
          <div>
            <h2 className="card-title" style={{ fontSize: 14 }}>BẢNG THỐNG KÊ TỔNG THỂ KINH DOANH & TỒN KHO</h2>
            <p style={{ fontSize: 11.5, color: '#64748b', marginTop: 1 }}>
              Dữ liệu thực tế đồng bộ theo bộ lọc kỳ ({summary?.periodLabel || 'Kỳ này'})
            </p>
          </div>

          <div style={{ position: 'relative', minWidth: 200 }}>
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: 28, paddingRight: 8, height: 30, fontSize: 12 }}
              placeholder="Tìm theo tên, SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search size={13} color="#94a3b8" style={{ position: 'absolute', left: 8, top: 8 }} />
          </div>
        </div>

        <div className="table-container" style={{ maxHeight: 520 }}>
          <table className="data-table" style={{ fontSize: 12.5 }}>
            <thead>
              <tr>
                <th style={{ width: 130 }}>Loại sản phẩm</th>
                <th style={{ minWidth: 200 }}>Sản phẩm</th>
                <th 
                  className="text-right" 
                  style={{ cursor: 'pointer', width: 85 }}
                  onClick={() => handleSort('total_available')}
                  title="Tổng số lượng hàng có trong kỳ = Tồn hiện tại + SL đã bán"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span>SL tổng</span>
                    <ArrowUpDown size={11} />
                  </div>
                </th>
                <th 
                  className="text-right" 
                  style={{ cursor: 'pointer', width: 80 }}
                  onClick={() => handleSort('total_imported')}
                  title="Tổng số lượng nhập trong kỳ"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span>SL nhập</span>
                    <ArrowUpDown size={11} />
                  </div>
                </th>
                <th 
                  className="text-right" 
                  style={{ cursor: 'pointer', width: 80 }}
                  onClick={() => handleSort('total_sold')}
                  title="Tổng số lượng đã bán trong kỳ"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span>SL bán</span>
                    <ArrowUpDown size={11} />
                  </div>
                </th>
                <th 
                  className="text-right" 
                  style={{ cursor: 'pointer', width: 80 }}
                  onClick={() => handleSort('current_stock')}
                  title="Số lượng tồn kho hiện tại"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span>SL tồn</span>
                    <ArrowUpDown size={11} />
                  </div>
                </th>
                <th className="text-right" style={{ width: 110 }} title="Giá vốn bình quân gia quyền của các lô hàng còn tồn theo FIFO">
                  Giá vốn BQ tồn
                </th>
                <th className="text-right" style={{ width: 100 }}>Giá bán</th>
                <th 
                  className="text-right" 
                  style={{ cursor: 'pointer', width: 120 }}
                  onClick={() => handleSort('stock_value')}
                  title="Giá trị tồn kho = SUM(SL còn lại x Giá nhập của từng lô)"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span>Giá trị tồn</span>
                    <ArrowUpDown size={11} />
                  </div>
                </th>
                <th 
                  className="text-right" 
                  style={{ cursor: 'pointer', width: 120 }}
                  onClick={() => handleSort('revenue')}
                  title="Doanh thu tính theo giá snapshot tại thời điểm bán"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span>Doanh thu</span>
                    <ArrowUpDown size={11} />
                  </div>
                </th>
                <th 
                  className="text-right" 
                  style={{ cursor: 'pointer', width: 110 }}
                  onClick={() => handleSort('profit')}
                  title="Lợi nhuận = Doanh thu - Giá vốn hàng bán"
                >
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <span>Lợi nhuận</span>
                    <ArrowUpDown size={11} />
                  </div>
                </th>
              </tr>
            </thead>

            <tbody>
              {loadingTable && (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '25px 0', color: '#64748b' }}>
                    Đang tải dữ liệu bảng thống kê...
                  </td>
                </tr>
              )}

              {!loadingTable && (!tableData?.rows || tableData.rows.length === 0) && (
                <tr>
                  <td colSpan={11} style={{ textAlign: 'center', padding: '35px 0', color: '#94a3b8' }}>
                    Không có dữ liệu sản phẩm nào phù hợp với bộ lọc.
                  </td>
                </tr>
              )}

              {!loadingTable && tableData?.rows?.map((row: any) => (
                <tr key={row.product_id}>
                  <td>
                    <span className="badge badge-neutral">{row.product_type_name}</span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{row.product_name}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>SKU: {row.sku} • {row.category_name}</div>
                  </td>
                  <td className="text-right" style={{ fontWeight: 500 }}>{row.total_available}</td>
                  <td className="text-right" style={{ color: '#059669', fontWeight: 500 }}>
                    {row.total_imported > 0 ? `+${row.total_imported}` : '0'}
                  </td>
                  <td className="text-right" style={{ color: '#2563eb', fontWeight: 600 }}>{row.total_sold}</td>
                  <td className="text-right">
                    <span style={{
                      fontWeight: 700,
                      color: row.current_stock <= 5 ? '#dc2626' : '#0f172a',
                    }}>
                      {row.current_stock}
                    </span>
                  </td>
                  <td className="text-right" style={{ color: '#64748b' }}>
                    {formatVND(row.cost_price)}
                  </td>
                  <td className="text-right" style={{ fontWeight: 500 }}>
                    {formatVND(row.selling_price)}
                  </td>
                  <td className="text-right" style={{ fontWeight: 600, color: '#0e7490' }}>
                    {formatVND(row.stock_value)}
                  </td>
                  <td className="text-right" style={{ fontWeight: 700, color: '#1d4ed8' }}>
                    {formatVND(row.revenue)}
                  </td>
                  <td className="text-right" style={{
                    fontWeight: 700,
                    color: row.profit > 0 ? '#15803d' : row.profit < 0 ? '#dc2626' : '#64748b'
                  }}>
                    {formatVND(row.profit)}
                  </td>
                </tr>
              ))}
            </tbody>

            {!loadingTable && tableData?.totals && (
              <tfoot>
                <tr>
                  <th colSpan={2} style={{ textAlign: 'left' }}>TỔNG CỘNG ({tableData.totalItems} SP)</th>
                  <th className="text-right">{tableData.totals.total_available}</th>
                  <th className="text-right" style={{ color: '#059669' }}>+{tableData.totals.total_imported}</th>
                  <th className="text-right" style={{ color: '#2563eb' }}>{tableData.totals.total_sold}</th>
                  <th className="text-right">{tableData.totals.current_stock}</th>
                  <th className="text-right">-</th>
                  <th className="text-right">-</th>
                  <th className="text-right" style={{ color: '#0e7490' }}>{formatVND(tableData.totals.stock_value)}</th>
                  <th className="text-right" style={{ color: '#1d4ed8' }}>{formatVND(tableData.totals.revenue)}</th>
                  <th className="text-right" style={{ color: '#15803d' }}>{formatVND(tableData.totals.profit)}</th>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
