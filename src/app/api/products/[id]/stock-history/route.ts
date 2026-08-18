import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, props: Props) {
  try {
    const { id } = await props.params;

    const movements = await db.query(`
      SELECT 
        sm.id, sm.product_id, sm.movement_type, sm.quantity_change, sm.balance_after,
        sm.movement_date, sm.reference_type, sm.reference_id, sm.note, sm.created_at,
        u.full_name as creator_name
      FROM stock_movements sm
      LEFT JOIN users u ON u.id = sm.created_by
      WHERE sm.product_id = ?
      ORDER BY sm.movement_date DESC, sm.id DESC
    `, [id]);

    return NextResponse.json({ success: true, data: movements });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
