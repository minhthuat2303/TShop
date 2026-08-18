import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { resolveDateRange } from '@/lib/date-utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30days';
    const customStart = searchParams.get('startDate');
    const customEnd = searchParams.get('endDate');

    const { startDate, endDate } = resolveDateRange(period, customStart, customEnd);

    const rows = await db.query(`
      SELECT 
        sr.sale_date,
        COUNT(sr.id) as order_count,
        SUM(sr.quantity) as total_quantity,
        SUM(sr.total_revenue) as total_revenue,
        SUM(sr.total_cost) as total_cost,
        SUM(sr.profit) as total_profit
      FROM sales_records sr
      WHERE sr.sale_date >= ? AND sr.sale_date <= ?
        AND COALESCE(sr.status, 'COMPLETED') = 'COMPLETED'
      GROUP BY sr.sale_date
      ORDER BY sr.sale_date ASC
    `, [startDate, endDate]);

    return NextResponse.json({
      success: true,
      data: rows,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
