'use client';

import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  Calendar, 
  ShoppingBag, 
  Boxes,
  ArrowUpRight
} from 'lucide-react';
import { DateFilterPeriod } from '@/lib/date-utils';

export default function ReportsPage() {
  const [period, setPeriod] = useState<DateFilterPeriod>('30days');
  const [salesByDate, setSalesByDate] = useState<any[]>([]);
  const [topSelling, setTopSelling] = useState<any[]>([]);
  const [slowMoving, setSlowMoving] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReports = async () => {
    setLoading(true);
    try {
      const [byDateRes, topRes] = await Promise.all([
        fetch(`/api/reports/sales-by-date?period=${period}`),
        fetch(`/api/reports/top-selling?period=${period}&limit=10`),
      ]);

      const byDateJson = await byDateRes.json();
      const topJson = await topRes.json();

      if (byDateJson.success) setSalesByDate(byDateJson.data);
      if (topJson.success) {
        setTopSelling(topJson.data.topSelling);
        setSlowMoving(topJson.data.slowMoving);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, [period]);

  const formatVND = (v: number) => (v || 0).toLocaleString('vi-VN') + ' đ';

  return (
    <div>
      {/* Period selector */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        backgroundColor: '#ffffff',
        padding: '12px 18px',
        borderRadius: 8,
        border: '1px solid var(--border-subtle)',
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Calendar size={16} color="#64748b" style={{ marginRight: 4 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#475569', marginRight: 6 }}>Khoảng thời gian:</span>

          {[
            { key: 'today', label: 'Hôm nay' },
            { key: '7days', label: '7 ngày qua' },
            { key: '30days', label: '30 ngày qua' },
            { key: 'this_month', label: 'Tháng này' },
            { key: 'last_month', label: 'Tháng trước' },
            { key: 'this_year', label: 'Năm nay' },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setPeriod(item.key as DateFilterPeriod)}
              className={`btn btn-sm ${period === item.key ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '4px 10px', fontSize: 12.5 }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Top selling products */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={16} color="#16a34a" />
              <h2 className="card-title" style={{ fontSize: 15 }}>Top sản phẩm bán chạy nhất</h2>
            </div>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th className="text-right">SL bán</th>
                  <th className="text-right">Doanh thu</th>
                  <th className="text-right">Lợi nhuận</th>
                </tr>
              </thead>
              <tbody>
                {topSelling.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>
                      Chưa có phát sinh bán trong kỳ này.
                    </td>
                  </tr>
                ) : (
                  topSelling.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>SKU: {p.sku}</div>
                      </td>
                      <td className="text-right" style={{ fontWeight: 700, color: '#2563eb' }}>
                        {p.sold_quantity}
                      </td>
                      <td className="text-right" style={{ fontWeight: 700, color: '#1d4ed8' }}>
                        {formatVND(p.total_revenue)}
                      </td>
                      <td className="text-right" style={{ fontWeight: 600, color: '#15803d' }}>
                        {formatVND(p.total_profit)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Slow moving products */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Boxes size={16} color="#d97706" />
              <h2 className="card-title" style={{ fontSize: 15 }}>Sản phẩm tồn nhiều / Bán chậm</h2>
            </div>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Sản phẩm</th>
                  <th>Danh mục</th>
                  <th className="text-right">Tồn kho</th>
                  <th className="text-right">Giá trị tồn</th>
                </tr>
              </thead>
              <tbody>
                {slowMoving.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>
                      Không có sản phẩm ứ đọng.
                    </td>
                  </tr>
                ) : (
                  slowMoving.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>SKU: {p.sku}</div>
                      </td>
                      <td style={{ fontSize: 12.5 }}>{p.category_name}</td>
                      <td className="text-right" style={{ fontWeight: 700, color: '#dc2626' }}>
                        {p.current_stock}
                      </td>
                      <td className="text-right" style={{ fontWeight: 600, color: '#0e7490' }}>
                        {formatVND(p.stock_valuation)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Daily sales breakdown ledger */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart3 size={16} color="#2563eb" />
            <h2 className="card-title" style={{ fontSize: 15 }}>Bảng chi tiết doanh thu & lợi nhuận theo ngày</h2>
          </div>
        </div>

        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ngày giao dịch</th>
                <th className="text-right">Số lượt bán</th>
                <th className="text-right">Số lượng sản phẩm</th>
                <th className="text-right">Tổng doanh thu</th>
                <th className="text-right">Tổng giá vốn</th>
                <th className="text-right">Lợi nhuận gộp</th>
              </tr>
            </thead>
            <tbody>
              {salesByDate.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '30px 0', color: '#94a3b8' }}>
                    Không có giao dịch bán hàng trong khoảng thời gian này.
                  </td>
                </tr>
              ) : (
                salesByDate.map((row) => (
                  <tr key={row.sale_date}>
                    <td style={{ fontWeight: 600 }}>{row.sale_date}</td>
                    <td className="text-right">{row.order_count}</td>
                    <td className="text-right" style={{ fontWeight: 600, color: '#2563eb' }}>
                      {row.total_quantity}
                    </td>
                    <td className="text-right" style={{ fontWeight: 700, color: '#1d4ed8' }}>
                      {formatVND(row.total_revenue)}
                    </td>
                    <td className="text-right" style={{ color: '#64748b' }}>
                      {formatVND(row.total_cost)}
                    </td>
                    <td className="text-right" style={{ fontWeight: 700, color: '#15803d' }}>
                      {formatVND(row.total_profit)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
