import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, props: Props) {
  try {
    const { id } = await props.params;

    const sales = await db.query(`
      SELECT 
        sr.id, sr.transaction_code, sr.product_id, sr.sale_date, sr.quantity,
        sr.unit_price_at_sale, sr.cost_price_at_sale, sr.total_revenue, sr.total_cost, sr.profit,
        sr.note, sr.created_at,
        u.full_name as seller_name
      FROM sales_records sr
      LEFT JOIN users u ON u.id = sr.created_by
      WHERE sr.product_id = ?
      ORDER BY sr.sale_date DESC, sr.id DESC
    `, [id]);

    return NextResponse.json({ success: true, data: sales });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
