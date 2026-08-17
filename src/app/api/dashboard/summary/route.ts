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

    const { startDate, endDate, label } = resolveDateRange(period, customStart, customEnd);

    // Filter conditions for sales records
    let salesWhere: string[] = [
      `sr.sale_date >= ?`,
      `sr.sale_date <= ?`,
    ];
    let salesParams: any[] = [startDate, endDate];

    if (productId) {
      salesWhere.push(`sr.product_id = ?`);
      salesParams.push(productId);
    } else {
      if (productTypeId) {
        salesWhere.push(`p.product_type_id = ?`);
        salesParams.push(productTypeId);
      }
      if (categoryId) {
        salesWhere.push(`p.category_id = ?`);
        salesParams.push(categoryId);
      }
    }

    // 1. Sales & Revenue & COGS & Profit in period
    const salesStats = db.prepare(`
      SELECT 
        COUNT(CASE WHEN COALESCE(sr.status, 'COMPLETED') = 'COMPLETED' THEN sr.id END) as sales_count,
        COALESCE(SUM(CASE WHEN COALESCE(sr.status, 'COMPLETED') = 'COMPLETED' THEN sr.quantity ELSE 0 END), 0) as sold_quantity,
        COALESCE(SUM(CASE WHEN COALESCE(sr.status, 'COMPLETED') = 'COMPLETED' THEN sr.total_revenue ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN COALESCE(sr.status, 'COMPLETED') = 'COMPLETED' THEN sr.total_cost ELSE 0 END), 0) as total_cost,
        COALESCE(SUM(CASE WHEN COALESCE(sr.status, 'COMPLETED') = 'COMPLETED' THEN sr.profit ELSE 0 END), 0) as total_profit,
        COUNT(CASE WHEN sr.status = 'CANCELLED' THEN sr.id END) as cancelled_count,
        COALESCE(SUM(CASE WHEN sr.status = 'CANCELLED' THEN sr.total_revenue ELSE 0 END), 0) as cancelled_revenue
      FROM sales_records sr
      JOIN products p ON p.id = sr.product_id
      WHERE ${salesWhere.join(' AND ')}
    `).get(...salesParams) as any;

    // Filter conditions for products
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

    // 2. Current total stock & low stock count
    const stockStats = db.prepare(`
      SELECT 
        COALESCE(SUM(p.current_stock), 0) as total_stock,
        COALESCE(SUM(CASE WHEN p.current_stock <= p.min_stock_alert THEN 1 ELSE 0 END), 0) as low_stock_count
      FROM products p
      WHERE ${prodWhere.join(' AND ')}
    `).get(...prodParams) as any;

    // 3. Exact Inventory Valuation from remaining lots: SUM(quantity_remaining * unit_cost)
    let lotWhere: string[] = ["il.quantity_remaining > 0", "p.status = 'ACTIVE'"];
    let lotParams: any[] = [];

    if (productId) {
      lotWhere.push('il.product_id = ?');
      lotParams.push(productId);
    } else {
      if (productTypeId) {
        lotWhere.push('p.product_type_id = ?');
        lotParams.push(productTypeId);
      }
      if (categoryId) {
        lotWhere.push('p.category_id = ?');
        lotParams.push(categoryId);
      }
    }

    const lotValuationRow = db.prepare(`
      SELECT 
        COALESCE(SUM(il.quantity_remaining * il.unit_cost), 0) as lot_valuation
      FROM inventory_lots il
      JOIN products p ON p.id = il.product_id
      WHERE ${lotWhere.join(' AND ')}
    `).get(...lotParams) as { lot_valuation: number };

    const stockValuation = lotValuationRow?.lot_valuation || 0;

    return NextResponse.json({
      success: true,
      data: {
        revenue: salesStats?.total_revenue || 0,
        cogs: salesStats?.total_cost || 0,
        profit: salesStats?.total_profit || 0,
        salesCount: salesStats?.sales_count || 0,
        soldQuantity: salesStats?.sold_quantity || 0,
        cancelledCount: salesStats?.cancelled_count || 0,
        cancelledRevenue: salesStats?.cancelled_revenue || 0,
        currentTotalStock: stockStats?.total_stock || 0,
        stockValuation: stockValuation,
        lowStockCount: stockStats?.low_stock_count || 0,
        periodLabel: label,
        dateRange: {
          startDate,
          endDate,
          period,
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
