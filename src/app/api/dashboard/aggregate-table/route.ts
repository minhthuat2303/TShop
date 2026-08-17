import { NextRequest, NextResponse } from 'next/server';
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
    const q = searchParams.get('q')?.trim();
    const status = searchParams.get('status') || 'ACTIVE';
    const sortBy = searchParams.get('sortBy') || 'revenue';
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'ASC' : 'DESC';

    const { startDate, endDate, label } = resolveDateRange(period, customStart, customEnd);

    let whereClauses: string[] = [];
    let params: any[] = [];

    if (status && status !== 'ALL') {
      whereClauses.push(`p.status = ?`);
      params.push(status);
    }

    if (productId) {
      whereClauses.push(`p.id = ?`);
      params.push(productId);
    } else {
      if (categoryId) {
        whereClauses.push(`p.category_id = ?`);
        params.push(categoryId);
      }
      if (productTypeId) {
        whereClauses.push(`p.product_type_id = ?`);
        params.push(productTypeId);
      }
    }

    if (q) {
      whereClauses.push(`(p.sku LIKE ? OR p.name LIKE ?)`);
      params.push(`%${q}%`, `%${q}%`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Aggregation query per product in period with FIFO lot valuation
    const rawRows = db.prepare(`
      SELECT 
        p.id as product_id,
        p.sku,
        p.name as product_name,
        c.name as category_name,
        pt.name as product_type_name,
        p.current_stock,
        p.current_selling_price as selling_price,
        p.status,

        -- Lot Valuation & Weighted Average Cost
        COALESCE(lots.lot_valuation, (p.current_stock * p.current_cost_price)) as stock_value,
        COALESCE(lots.avg_lot_cost, p.current_cost_price) as avg_cost_price,

        -- Sold in period
        COALESCE(sales.sold_qty, 0) as total_sold,
        COALESCE(sales.period_revenue, 0) as revenue,
        COALESCE(sales.period_cogs, 0) as cogs,
        COALESCE(sales.period_profit, 0) as profit,

        -- Imported in period
        COALESCE(imports.imported_qty, 0) as total_imported

      FROM products p
      JOIN categories c ON c.id = p.category_id
      JOIN product_types pt ON pt.id = p.product_type_id

      -- Subquery for active remaining lots
      LEFT JOIN (
        SELECT 
          product_id,
          SUM(quantity_remaining * unit_cost) as lot_valuation,
          ROUND(SUM(quantity_remaining * unit_cost) / NULLIF(SUM(quantity_remaining), 0)) as avg_lot_cost
        FROM inventory_lots
        WHERE quantity_remaining > 0
        GROUP BY product_id
      ) lots ON lots.product_id = p.id

      -- Subquery for sales in period
      LEFT JOIN (
        SELECT 
          product_id,
          SUM(quantity) as sold_qty,
          SUM(total_revenue) as period_revenue,
          SUM(total_cost) as period_cogs,
          SUM(profit) as period_profit
        FROM sales_records
        WHERE sale_date >= '${startDate}' AND sale_date <= '${endDate}'
          AND COALESCE(status, 'COMPLETED') = 'COMPLETED'
        GROUP BY product_id
      ) sales ON sales.product_id = p.id

      -- Subquery for imports in period
      LEFT JOIN (
        SELECT 
          product_id,
          SUM(quantity_change) as imported_qty
        FROM stock_movements
        WHERE movement_type = 'PURCHASE'
          AND movement_date >= '${startDate}' AND movement_date <= '${endDate}'
        GROUP BY product_id
      ) imports ON imports.product_id = p.id

      ${whereSql}
    `).all(...params) as any[];

    // Calculate total_available = current_stock + total_sold
    const formattedRows = rawRows.map((row) => ({
      ...row,
      cost_price: Number(row.avg_cost_price) || 0,
      stock_value: Number(row.stock_value) || 0,
      total_available: Number(row.current_stock) + Number(row.total_sold),
    }));

    // Sorting
    formattedRows.sort((a, b) => {
      let valA = a[sortBy] ?? 0;
      let valB = b[sortBy] ?? 0;
      if (typeof valA === 'string') {
        return sortOrder === 'ASC' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortOrder === 'ASC' ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
    });

    // Summary totals for footer
    const totals = formattedRows.reduce(
      (acc, r) => ({
        total_available: acc.total_available + r.total_available,
        total_imported: acc.total_imported + r.total_imported,
        total_sold: acc.total_sold + r.total_sold,
        current_stock: acc.current_stock + r.current_stock,
        stock_value: acc.stock_value + r.stock_value,
        revenue: acc.revenue + r.revenue,
        cogs: acc.cogs + (r.cogs || 0),
        profit: acc.profit + r.profit,
      }),
      {
        total_available: 0,
        total_imported: 0,
        total_sold: 0,
        current_stock: 0,
        stock_value: 0,
        revenue: 0,
        cogs: 0,
        profit: 0,
      }
    );

    return NextResponse.json({
      success: true,
      data: {
        rows: formattedRows,
        totals,
        totalItems: formattedRows.length,
        periodLabel: label,
        dateRange: { startDate, endDate, period },
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
