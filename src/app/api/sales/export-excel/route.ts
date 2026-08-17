import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const productId = searchParams.get('productId');
    const status = searchParams.get('status');
    const q = searchParams.get('q')?.trim();

    let whereClauses: string[] = [];
    let params: any[] = [];

    if (startDate) {
      whereClauses.push(`sr.sale_date >= ?`);
      params.push(startDate);
    }

    if (endDate) {
      whereClauses.push(`sr.sale_date <= ?`);
      params.push(endDate);
    }

    if (productId) {
      whereClauses.push(`sr.product_id = ?`);
      params.push(productId);
    }

    if (status && status !== 'ALL') {
      whereClauses.push(`COALESCE(sr.status, 'COMPLETED') = ?`);
      params.push(status);
    }

    if (q) {
      whereClauses.push(`(sr.transaction_code LIKE ? OR p.name LIKE ? OR p.sku LIKE ? OR sr.note LIKE ?)`);
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const records = db.prepare(`
      SELECT 
        sr.id, sr.transaction_code, sr.sale_date, sr.quantity,
        sr.unit_price_at_sale, sr.cost_price_at_sale, 
        COALESCE(sr.discount, 0) as discount,
        sr.total_revenue, sr.total_cost, sr.profit,
        COALESCE(sr.status, 'COMPLETED') as status,
        sr.cancel_reason, sr.cancelled_at,
        sr.note, sr.created_at,
        p.name as product_name, p.sku,
        c.name as category_name,
        pt.name as product_type_name,
        u.full_name as seller_name,
        canceller.full_name as canceller_name
      FROM sales_records sr
      JOIN products p ON p.id = sr.product_id
      JOIN categories c ON c.id = p.category_id
      JOIN product_types pt ON pt.id = p.product_type_id
      LEFT JOIN users u ON u.id = sr.created_by
      LEFT JOIN users canceller ON canceller.id = sr.cancelled_by
      ${whereSql}
      ORDER BY sr.sale_date DESC, sr.id DESC
    `).all(...params) as any[];

    const excelData = records.map((r) => ({
      'Mã giao dịch': r.transaction_code,
      'Ngày bán': r.sale_date,
      'Mã SKU': r.sku,
      'Tên sản phẩm': r.product_name,
      'Danh mục': r.category_name,
      'Loại SP': r.product_type_name,
      'Số lượng': Number(r.quantity),
      'Đơn giá bán (đ)': Number(r.unit_price_at_sale),
      'Giảm giá (đ)': Number(r.discount),
      'Doanh thu (đ)': Number(r.total_revenue),
      'Giá vốn (đ)': Number(r.total_cost),
      'Lợi nhuận (đ)': Number(r.profit),
      'Trạng thái': r.status === 'CANCELLED' ? 'Đã hủy' : 'Hoàn thành',
      'Người bán': r.seller_name || 'Hệ thống',
      'Lý do hủy': r.cancel_reason || '',
      'Ghi chú': r.note || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Apply number formatting #,##0 to numeric cells
    for (const cellKey of Object.keys(worksheet)) {
      if (cellKey.startsWith('!')) continue;
      const cell = worksheet[cellKey];
      if (cell && cell.t === 'n') {
        cell.z = '#,##0';
      }
    }

    // Set column widths
    worksheet['!cols'] = [
      { wch: 22 }, // Mã GD
      { wch: 13 }, // Ngày bán
      { wch: 14 }, // SKU
      { wch: 32 }, // Tên SP
      { wch: 18 }, // Danh mục
      { wch: 18 }, // Loại SP
      { wch: 10 }, // SL
      { wch: 15 }, // Đơn giá
      { wch: 13 }, // Giảm giá
      { wch: 16 }, // Doanh thu
      { wch: 15 }, // Giá vốn
      { wch: 15 }, // Lợi nhuận
      { wch: 14 }, // Trạng thái
      { wch: 16 }, // Người bán
      { wch: 25 }, // Lý do hủy
      { wch: 25 }, // Ghi chú
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Lịch sử bán hàng');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const uint8 = new Uint8Array(buffer);
    const dateTag = startDate && endDate ? `${startDate}_${endDate}` : new Date().toISOString().split('T')[0];

    return new Response(uint8, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Lich_su_ban_hang_${dateTag}.xlsx"`,
        'Content-Length': uint8.length.toString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'EXPORT_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
