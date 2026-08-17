import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    const categoryId = searchParams.get('categoryId');
    const status = searchParams.get('status'); // AVAILABLE, EXHAUSTED, ALL
    const q = searchParams.get('q')?.trim();
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

    let whereClauses: string[] = [];
    let params: any[] = [];

    if (productId) {
      whereClauses.push('il.product_id = ?');
      params.push(productId);
    }

    if (categoryId) {
      whereClauses.push('p.category_id = ?');
      params.push(categoryId);
    }

    if (status === 'AVAILABLE') {
      whereClauses.push('il.quantity_remaining > 0');
    } else if (status === 'EXHAUSTED') {
      whereClauses.push('il.quantity_remaining = 0');
    }

    if (q) {
      whereClauses.push('(il.lot_code LIKE ? OR p.name LIKE ? OR p.sku LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countResult = db.prepare(`
      SELECT 
        COUNT(il.id) as total,
        COALESCE(SUM(il.quantity_received), 0) as sum_received,
        COALESCE(SUM(il.quantity_remaining), 0) as sum_remaining,
        COALESCE(SUM(il.quantity_remaining * il.unit_cost), 0) as sum_remaining_value
      FROM inventory_lots il
      JOIN products p ON p.id = il.product_id
      ${whereSql}
    `).get(...params) as any;

    const total = countResult?.total || 0;
    const totalPages = Math.ceil(total / limit);

    const lots = db.prepare(`
      SELECT 
        il.id,
        il.lot_code,
        il.product_id,
        p.name as product_name,
        p.sku,
        c.name as category_name,
        pt.name as product_type_name,
        il.purchase_date,
        il.quantity_received,
        il.quantity_remaining,
        il.unit_cost,
        (il.quantity_remaining * il.unit_cost) as remaining_value,
        il.supplier_id,
        s.name as supplier_name,
        il.import_id,
        il.note,
        il.created_at,
        u.full_name as creator_name,
        CASE WHEN il.quantity_remaining > 0 THEN 'AVAILABLE' ELSE 'EXHAUSTED' END as status
      FROM inventory_lots il
      JOIN products p ON p.id = il.product_id
      JOIN categories c ON c.id = p.category_id
      JOIN product_types pt ON pt.id = p.product_type_id
      LEFT JOIN suppliers s ON s.id = il.supplier_id
      LEFT JOIN users u ON u.id = il.created_by
      ${whereSql}
      ORDER BY il.purchase_date DESC, il.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as any[];

    return NextResponse.json({
      success: true,
      data: lots,
      summary: {
        totalReceived: countResult?.sum_received || 0,
        totalRemaining: countResult?.sum_remaining || 0,
        totalRemainingValue: countResult?.sum_remaining_value || 0,
        lotCount: total,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
