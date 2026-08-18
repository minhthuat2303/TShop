import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';
import { resolveDateRange } from '@/lib/date-utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'this_month';
    const customStart = searchParams.get('startDate');
    const customEnd = searchParams.get('endDate');
    const categoryId = searchParams.get('categoryId');
    const productTypeId = searchParams.get('productTypeId');
    const productId = searchParams.get('productId');

    const { startDate, endDate } = resolveDateRange(period, customStart, customEnd);

    let whereClauses: string[] = ["p.status = 'ACTIVE'"];
    let params: any[] = [];

    if (productId) {
      whereClauses.push('p.id = ?');
      params.push(productId);
    } else {
      if (categoryId) {
        whereClauses.push('p.category_id = ?');
        params.push(categoryId);
      }
      if (productTypeId) {
        whereClauses.push('p.product_type_id = ?');
        params.push(productTypeId);
      }
    }

    const whereSql = whereClauses.join(' AND ');

    const rawRows = await db.query<any>(`
      SELECT 
        c.name as category_name,
        pt.name as product_type_name,
        p.sku,
        p.name as product_name,
        p.current_stock,
        p.current_selling_price,
        COALESCE(lots.lot_valuation, (p.current_stock * p.current_cost_price)) as stock_value,
        COALESCE(lots.avg_lot_cost, p.current_cost_price) as avg_cost_price,
        COALESCE(sales.sold_qty, 0) as total_sold,
        COALESCE(sales.period_revenue, 0) as revenue,
        COALESCE(sales.period_profit, 0) as profit,
        COALESCE(imports.imported_qty, 0) as total_imported
      FROM products p
      JOIN categories c ON c.id = p.category_id
      JOIN product_types pt ON pt.id = p.product_type_id
      LEFT JOIN (
        SELECT 
          product_id,
          SUM(quantity_remaining * unit_cost) as lot_valuation,
          ROUND(SUM(quantity_remaining * unit_cost) / NULLIF(SUM(quantity_remaining), 0)) as avg_lot_cost
        FROM inventory_lots
        WHERE quantity_remaining > 0
        GROUP BY product_id
      ) lots ON lots.product_id = p.id
      LEFT JOIN (
        SELECT 
          product_id,
          SUM(quantity) as sold_qty,
          SUM(total_revenue) as period_revenue,
          SUM(profit) as period_profit
        FROM sales_records
        WHERE sale_date >= '${startDate}' AND sale_date <= '${endDate}'
          AND COALESCE(status, 'COMPLETED') = 'COMPLETED'
        GROUP BY product_id
      ) sales ON sales.product_id = p.id
      LEFT JOIN (
        SELECT 
          product_id,
          SUM(quantity_change) as imported_qty
        FROM stock_movements
        WHERE movement_type = 'PURCHASE'
          AND movement_date >= '${startDate}' AND movement_date <= '${endDate}'
        GROUP BY product_id
      ) imports ON imports.product_id = p.id
      WHERE ${whereSql}
      ORDER BY c.name ASC, pt.name ASC, p.name ASC
    `, params);

    const excelData = rawRows.map((r) => ({
      'Danh mục': r.category_name,
      'Loại sản phẩm': r.product_type_name,
      'Mã SKU': r.sku,
      'Tên sản phẩm': r.product_name,
      'SL tổng': Number(r.current_stock) + Number(r.total_sold),
      'SL nhập': Number(r.total_imported),
      'SL bán': Number(r.total_sold),
      'SL tồn': Number(r.current_stock),
      'Giá vốn BQ tồn': Number(r.avg_cost_price),
      'Giá bán': Number(r.current_selling_price),
      'Giá trị tồn': Number(r.stock_value),
      'Doanh thu': Number(r.revenue),
      'Lợi nhuận': Number(r.profit),
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);

    for (const cellKey of Object.keys(worksheet)) {
      if (cellKey.startsWith('!')) continue;
      const cell = worksheet[cellKey];
      if (cell && cell.t === 'n') {
        cell.z = '#,##0';
      }
    }

    worksheet['!cols'] = [
      { wch: 18 }, // Danh mục
      { wch: 20 }, // Loại SP
      { wch: 14 }, // Mã SKU
      { wch: 32 }, // Tên SP
      { wch: 10 }, // SL tổng
      { wch: 10 }, // SL nhập
      { wch: 10 }, // SL bán
      { wch: 10 }, // SL tồn
      { wch: 16 }, // Giá vốn BQ tồn
      { wch: 14 }, // Giá bán
      { wch: 16 }, // Giá trị tồn
      { wch: 16 }, // Doanh thu
      { wch: 16 }, // Lợi nhuận
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Thống kê tổng thể');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const uint8 = new Uint8Array(buffer);

    return new Response(uint8, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Thong_ke_shop_do_choi_${startDate}_${endDate}.xlsx"`,
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
