import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const productId = parseInt(id, 10);

    if (isNaN(productId)) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_ID', message: 'ID sản phẩm không hợp lệ.' } },
        { status: 400 }
      );
    }

    const lots = await db.query(`
      SELECT 
        il.id,
        il.lot_code,
        il.product_id,
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
      LEFT JOIN suppliers s ON s.id = il.supplier_id
      LEFT JOIN users u ON u.id = il.created_by
      WHERE il.product_id = ?
      ORDER BY il.purchase_date DESC, il.id DESC
    `, [productId]) as any[];

    // Calculate totals
    const totalReceived = lots.reduce((s, l) => s + Number(l.quantity_received || 0), 0);
    const totalRemaining = lots.reduce((s, l) => s + Number(l.quantity_remaining || 0), 0);
    const totalRemainingValue = lots.reduce((s, l) => s + Number(l.remaining_value || 0), 0);
    const weightedAvgCost = totalRemaining > 0 ? Math.round(totalRemainingValue / totalRemaining) : 0;

    return NextResponse.json({
      success: true,
      data: lots,
      summary: {
        totalReceived,
        totalRemaining,
        totalRemainingValue,
        weightedAvgCost,
        lotCount: lots.length,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
