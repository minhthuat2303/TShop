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

    // Aggregate daily stats (100% ANSI SQL compatible across Postgres and SQLite)
    const dailyRows = await db.query<any>(`
      SELECT 
        sr.sale_date as time_key,
        COUNT(sr.id) as transaction_count,
        COALESCE(SUM(sr.quantity), 0) as sold_quantity,
        COALESCE(SUM(sr.total_revenue), 0) as revenue,
        COALESCE(SUM(sr.total_cost), 0) as total_cost,
        COALESCE(SUM(sr.profit), 0) as profit
      FROM sales_records sr
      JOIN products p ON p.id = sr.product_id
      WHERE ${whereSql}
      GROUP BY sr.sale_date
      ORDER BY sr.sale_date ASC
    `, params);

    // Grouping according to granularity
    let chartData: any[] = [];

    if (granularity === 'day') {
      const rowMap = new Map<string, any>();
      dailyRows.forEach((r) => {
        const dStr = typeof r.time_key === 'string' ? r.time_key.slice(0, 10) : new Date(r.time_key).toISOString().split('T')[0];
        rowMap.set(dStr, {
          revenue: Number(r.revenue),
          profit: Number(r.profit),
          soldQuantity: Number(r.sold_quantity),
          transactionCount: Number(r.transaction_count),
        });
      });

      if (diffDays <= 31) {
        const current = new Date(startDate);
        const end = new Date(endDate);

        while (current <= end) {
          const dateStr = current.toISOString().split('T')[0];
          const existing = rowMap.get(dateStr);

          filledPush(chartData, dateStr, dateStr.slice(5).replace('-', '/'), dateStr, existing);
          current.setDate(current.getDate() + 1);
        }
      } else {
        dailyRows.forEach((r) => {
          const dStr = typeof r.time_key === 'string' ? r.time_key.slice(0, 10) : new Date(r.time_key).toISOString().split('T')[0];
          chartData.push({
            timeKey: dStr,
            label: dStr.slice(5).replace('-', '/'),
            fullDate: dStr,
            revenue: Number(r.revenue),
            profit: Number(r.profit),
            soldQuantity: Number(r.sold_quantity),
            transactionCount: Number(r.transaction_count),
          });
        });
      }
    } else if (granularity === 'month') {
      const monthMap = new Map<string, { revenue: number; profit: number; soldQuantity: number; transactionCount: number }>();
      dailyRows.forEach((r) => {
        const dStr = typeof r.time_key === 'string' ? r.time_key.slice(0, 10) : new Date(r.time_key).toISOString().split('T')[0];
        const mKey = dStr.slice(0, 7); // YYYY-MM
        const cur = monthMap.get(mKey) || { revenue: 0, profit: 0, soldQuantity: 0, transactionCount: 0 };
        cur.revenue += Number(r.revenue);
        cur.profit += Number(r.profit);
        cur.soldQuantity += Number(r.sold_quantity);
        cur.transactionCount += Number(r.transaction_count);
        monthMap.set(mKey, cur);
      });

      Array.from(monthMap.entries()).sort(([a], [b]) => a.localeCompare(b)).forEach(([mKey, val]) => {
        chartData.push({
          timeKey: mKey,
          label: `${mKey.slice(5)}/${mKey.slice(0, 4)}`,
          fullDate: mKey,
          revenue: val.revenue,
          profit: val.profit,
          soldQuantity: val.soldQuantity,
          transactionCount: val.transactionCount,
        });
      });
    } else {
      // Week granularity
      chartData = dailyRows.map((r) => {
        const dStr = typeof r.time_key === 'string' ? r.time_key.slice(0, 10) : new Date(r.time_key).toISOString().split('T')[0];
        return {
          timeKey: dStr,
          label: dStr.slice(5).replace('-', '/'),
          fullDate: dStr,
          revenue: Number(r.revenue),
          profit: Number(r.profit),
          soldQuantity: Number(r.sold_quantity),
          transactionCount: Number(r.transaction_count),
        };
      });
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

function filledPush(arr: any[], timeKey: string, label: string, fullDate: string, existing?: any) {
  if (existing) {
    arr.push({
      timeKey,
      label,
      fullDate,
      revenue: existing.revenue,
      profit: existing.profit,
      soldQuantity: existing.soldQuantity,
      transactionCount: existing.transactionCount,
    });
  } else {
    arr.push({
      timeKey,
      label,
      fullDate,
      revenue: 0,
      profit: 0,
      soldQuantity: 0,
      transactionCount: 0,
    });
  }
}
