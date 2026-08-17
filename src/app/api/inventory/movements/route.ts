import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    const movementType = searchParams.get('movementType');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

    let whereClauses: string[] = [];
    let params: any[] = [];

    if (productId) {
      whereClauses.push(`sm.product_id = ?`);
      params.push(productId);
    }

    if (movementType) {
      whereClauses.push(`sm.movement_type = ?`);
      params.push(movementType);
    }

    if (startDate) {
      whereClauses.push(`sm.movement_date >= ?`);
      params.push(startDate);
    }

    if (endDate) {
      whereClauses.push(`sm.movement_date <= ?`);
      params.push(endDate);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countResult = db.prepare(`
      SELECT COUNT(*) as total
      FROM stock_movements sm
      ${whereSql}
    `).get(...params) as { total: number };

    const total = countResult?.total || 0;
    const totalPages = Math.ceil(total / limit);

    const movements = db.prepare(`
      SELECT 
        sm.id, sm.product_id, sm.movement_type, sm.quantity_change, sm.balance_after,
        sm.movement_date, sm.reference_type, sm.reference_id, sm.note, sm.created_at,
        p.name as product_name, p.sku,
        u.full_name as creator_name
      FROM stock_movements sm
      JOIN products p ON p.id = sm.product_id
      LEFT JOIN users u ON u.id = sm.created_by
      ${whereSql}
      ORDER BY sm.movement_date DESC, sm.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return NextResponse.json({
      success: true,
      data: movements,
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
