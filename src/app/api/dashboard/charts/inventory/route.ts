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

    // Build product filter condition
    let prodWhere: string[] = ["p.status = 'ACTIVE'"];
    let prodParams: any[] = [];

    if (productId) {
      prodWhere.push('p.id = ?');
      prodParams.push(productId);
    } else {
      if (productTypeId) {
        prodWhere.push('p.product_type_id = ?');
        prodParams.push(productTypeId);
      }
      if (categoryId) {
        prodWhere.push('p.category_id = ?');
        prodParams.push(categoryId);
      }
    }

    const prodWhereSql = prodWhere.join(' AND ');

    // 1. Current stock of the filtered product set
    const currentStockRow = db.prepare(`
      SELECT COALESCE(SUM(p.current_stock), 0) as total_current_stock
      FROM products p
      WHERE ${prodWhereSql}
    `).get(...prodParams) as { total_current_stock: number };

    const currentTotalStock = currentStockRow?.total_current_stock || 0;

    // 2. Query all stock movements of the filtered products from startDate up to today
    // (needed to compute interval stock balances backward and forward)
    let moveWhere: string[] = [];
    let moveParams: any[] = [];

    if (productId) {
      moveWhere.push('sm.product_id = ?');
      moveParams.push(productId);
    } else {
      if (productTypeId) {
        moveWhere.push('p.product_type_id = ?');
        moveParams.push(productTypeId);
      }
      if (categoryId) {
        moveWhere.push('p.category_id = ?');
        moveParams.push(categoryId);
      }
    }

    const moveWhereSql = moveWhere.length > 0 ? `AND ${moveWhere.join(' AND ')}` : '';

    // Fetch movements in period
    const periodMovements = db.prepare(`
      SELECT 
        sm.movement_date,
        sm.movement_type,
        sm.quantity_change
      FROM stock_movements sm
      JOIN products p ON p.id = sm.product_id
      WHERE sm.movement_date >= ? AND sm.movement_date <= ?
        ${moveWhereSql}
      ORDER BY sm.movement_date ASC, sm.id ASC
    `).all(startDate, endDate, ...moveParams) as any[];

    // Fetch movements after endDate (to accurately project stock balance at endDate back from current stock)
    const futureMovements = db.prepare(`
      SELECT COALESCE(SUM(sm.quantity_change), 0) as future_change
      FROM stock_movements sm
      JOIN products p ON p.id = sm.product_id
      WHERE sm.movement_date > ?
        ${moveWhereSql}
    `).get(endDate, ...moveParams) as { future_change: number };

    // Total stock balance at the end of endDate
    const stockAtEndOfPeriod = currentTotalStock - (futureMovements?.future_change || 0);

    // Grouping by interval
    let timePoints: Array<{
      timeKey: string;
      label: string;
      fullDate: string;
      startDate: string;
      endDate: string;
    }> = [];

    if (granularity === 'day') {
      const current = new Date(startDate);
      const end = new Date(endDate);
      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        timePoints.push({
          timeKey: dateStr,
          label: dateStr.slice(5).replace('-', '/'),
          fullDate: dateStr,
          startDate: dateStr,
          endDate: dateStr,
        });
        current.setDate(current.getDate() + 1);
      }
    } else if (granularity === 'month') {
      const rows = db.prepare(`
        SELECT DISTINCT strftime('%Y-%m', sm.movement_date) as m
        FROM stock_movements sm
        JOIN products p ON p.id = sm.product_id
        WHERE sm.movement_date >= ? AND sm.movement_date <= ? ${moveWhereSql}
        ORDER BY m ASC
      `).all(startDate, endDate, ...moveParams) as any[];

      timePoints = rows.map((r) => ({
        timeKey: r.m,
        label: r.m.slice(5) + '/' + r.m.slice(0, 4),
        fullDate: r.m,
        startDate: `${r.m}-01`,
        endDate: `${r.m}-31`,
      }));
    }

    // If no specific intervals generated, fallback to daily points
    if (timePoints.length === 0) {
      timePoints.push({
        timeKey: startDate,
        label: startDate,
        fullDate: `${startDate} ~ ${endDate}`,
        startDate,
        endDate,
      });
    }

    // Now calculate for each interval:
    // - purchase: sum of positive changes from PURCHASE
    // - sales: sum of absolute changes from SALE
    // - ending stock of that interval
    const chartData = timePoints.map((tp) => {
      let intervalPurchases = 0;
      let intervalSales = 0;

      periodMovements.forEach((m) => {
        if (m.movement_date >= tp.startDate && m.movement_date <= tp.endDate) {
          if (m.movement_type === 'PURCHASE') {
            intervalPurchases += m.quantity_change;
          } else if (m.movement_type === 'SALE') {
            intervalSales += Math.abs(m.quantity_change);
          }
        }
      });

      // Compute stock at the end of tp.endDate:
      // Stock(T) = stockAtEndOfPeriod - (all movements occurring between tp.endDate and endDate)
      let movementsAfterThis = 0;
      periodMovements.forEach((m) => {
        if (m.movement_date > tp.endDate) {
          movementsAfterThis += m.quantity_change;
        }
      });

      const stockAtIntervalEnd = stockAtEndOfPeriod - movementsAfterThis;

      return {
        timeKey: tp.timeKey,
        label: tp.label,
        fullDate: tp.fullDate,
        stock: Math.max(0, stockAtIntervalEnd),
        purchase: intervalPurchases,
        sales: intervalSales,
      };
    });

    return NextResponse.json({
      success: true,
      data: chartData,
      summary: {
        currentTotalStock,
        totalPurchasedInPeriod: chartData.reduce((s, d) => s + d.purchase, 0),
        totalSoldInPeriod: chartData.reduce((s, d) => s + d.sales, 0),
        granularity,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'CHART_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
