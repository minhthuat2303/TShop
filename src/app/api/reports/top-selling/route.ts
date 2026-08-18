import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveDateRange } from '@/lib/date-utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'this_month';
    const customStart = searchParams.get('startDate');
    const customEnd = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    const { startDate, endDate } = resolveDateRange(period, customStart, customEnd);

    // Top selling by quantity & revenue
    const topProducts = await db.query(`
      SELECT 
        p.id, p.sku, p.name,
        c.name as category_name,
        pt.name as product_type_name,
        SUM(sr.quantity) as sold_quantity,
        SUM(sr.total_revenue) as total_revenue,
        SUM(sr.profit) as total_profit,
        p.current_stock
      FROM sales_records sr
      JOIN products p ON p.id = sr.product_id
      JOIN categories c ON c.id = p.category_id
      JOIN product_types pt ON pt.id = p.product_type_id
      WHERE sr.sale_date >= ? AND sr.sale_date <= ?
        AND COALESCE(sr.status, 'COMPLETED') = 'COMPLETED'
      GROUP BY p.id, p.sku, p.name, c.name, pt.name, p.current_stock
      ORDER BY sold_quantity DESC, total_revenue DESC
      LIMIT ?
    `, [startDate, endDate, limit]);

    // Slow moving products (0 sales in period)
    const slowProducts = await db.query(`
      SELECT 
        p.id, p.sku, p.name, p.current_stock, p.current_cost_price,
        (p.current_stock * p.current_cost_price) as stock_valuation,
        c.name as category_name,
        pt.name as product_type_name
      FROM products p
      JOIN categories c ON c.id = p.category_id
      JOIN product_types pt ON pt.id = p.product_type_id
      WHERE p.status = 'ACTIVE'
        AND p.id NOT IN (
          SELECT DISTINCT product_id 
          FROM sales_records 
          WHERE sale_date >= ? AND sale_date <= ?
            AND COALESCE(status, 'COMPLETED') = 'COMPLETED'
        )
      ORDER BY p.current_stock DESC
      LIMIT ?
    `, [startDate, endDate, limit]);

    return NextResponse.json({
      success: true,
      data: {
        topSelling: topProducts,
        slowMoving: slowProducts,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
