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

    const { startDate, endDate } = resolveDateRange(period, customStart, customEnd);

    // Calculate days diff to determine adaptive granularity if not explicitly passed
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    const diffDays = Math.ceil(Math.abs(endMs - startMs) / (1000 * 60 * 60 * 24)) + 1;

    let granularity = searchParams.get('granularity');
    if (!granularity) {
      if (diffDays <= 31) {
        granularity = 'day';
      } else if (diffDays <= 90) {
        granularity = 'week';
      } else {
        granularity = 'month';
      }
    }

    // Build filter query for products
    let whereClauses: string[] = [
      `sr.sale_date >= ?`,
      `sr.sale_date <= ?`,
      `COALESCE(sr.status, 'COMPLETED') = 'COMPLETED'`,
    ];
    let params: any[] = [startDate, endDate];

    if (productId) {
      whereClauses.push(`sr.product_id = ?`);
      params.push(productId);
    } else {
      if (productTypeId) {
        whereClauses.push(`p.product_type_id = ?`);
        params.push(productTypeId);
      }
      if (categoryId) {
        whereClauses.push(`p.category_id = ?`);
        params.push(categoryId);
      }
    }

    const whereSql = whereClauses.join(' AND ');

    // Grouping expression according to granularity
    // SQLite: '%Y-%m-%d' for day, '%Y-W%W' for week, '%Y-%m' for month
    let dateGroupExpr = "sr.sale_date";
    let dateLabelExpr = "sr.sale_date";

    if (granularity === 'month') {
      dateGroupExpr = "strftime('%Y-%m', sr.sale_date)";
      dateLabelExpr = "strftime('%m/%Y', sr.sale_date)";
    } else if (granularity === 'week') {
      dateGroupExpr = "strftime('%Y-W%W', sr.sale_date)";
      dateLabelExpr = "strftime('T%W/%Y', sr.sale_date)";
    }

    // Aggregate revenue & profit from sales_records (Snapshot values)
    const rows = db.prepare(`
      SELECT 
        ${dateGroupExpr} as time_key,
        MIN(sr.sale_date) as start_date,
        MAX(sr.sale_date) as end_date,
        COUNT(sr.id) as transaction_count,
        COALESCE(SUM(sr.quantity), 0) as sold_quantity,
        COALESCE(SUM(sr.total_revenue), 0) as revenue,
        COALESCE(SUM(sr.total_cost), 0) as total_cost,
        COALESCE(SUM(sr.profit), 0) as profit
      FROM sales_records sr
      JOIN products p ON p.id = sr.product_id
      WHERE ${whereSql}
      GROUP BY ${dateGroupExpr}
      ORDER BY MIN(sr.sale_date) ASC
    `).all(...params) as any[];

    // If day granularity and in <= 31 days range, fill in missing days with 0 for smooth line
    let chartData = rows;
    if (granularity === 'day' && diffDays <= 31) {
      const rowMap = new Map<string, any>();
      rows.forEach((r) => rowMap.set(r.time_key, r));

      const filled: any[] = [];
      const current = new Date(startDate);
      const end = new Date(endDate);

      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        const existing = rowMap.get(dateStr);

        if (existing) {
          filled.push({
            timeKey: dateStr,
            label: dateStr.slice(5).replace('-', '/'), // MM/DD
            fullDate: dateStr,
            revenue: existing.revenue,
            profit: existing.profit,
            soldQuantity: existing.sold_quantity,
            transactionCount: existing.transaction_count,
          });
        } else {
          filled.push({
            timeKey: dateStr,
            label: dateStr.slice(5).replace('-', '/'),
            fullDate: dateStr,
            revenue: 0,
            profit: 0,
            soldQuantity: 0,
            transactionCount: 0,
          });
        }
        current.setDate(current.getDate() + 1);
      }
      chartData = filled;
    } else {
      chartData = rows.map((r) => ({
        timeKey: r.time_key,
        label: granularity === 'month' 
          ? r.time_key.slice(5) + '/' + r.time_key.slice(0, 4)
          : r.time_key,
        fullDate: `${r.start_date} ~ ${r.end_date}`,
        revenue: r.revenue,
        profit: r.profit,
        soldQuantity: r.sold_quantity,
        transactionCount: r.transaction_count,
      }));
    }

    const totalRevenue = chartData.reduce((acc, d) => acc + d.revenue, 0);
    const totalProfit = chartData.reduce((acc, d) => acc + d.profit, 0);

    return NextResponse.json({
      success: true,
      data: chartData,
      summary: {
        totalRevenue,
        totalProfit,
        granularity,
        pointCount: chartData.length,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'CHART_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
