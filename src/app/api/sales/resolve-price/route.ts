import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    if (!productId) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'Thiếu productId.' } },
        { status: 400 }
      );
    }

    const product = await db.queryOne<any>(`
      SELECT id, sku, name, current_cost_price, current_selling_price, current_stock, status
      FROM products
      WHERE id = ?
    `, [productId]);

    if (!product) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy sản phẩm.' } },
        { status: 404 }
      );
    }

    // Resolve selling price at specific date
    const priceRecord = await db.queryOne<any>(`
      SELECT price, effective_from
      FROM price_history
      WHERE product_id = ? AND effective_from <= ?
      ORDER BY effective_from DESC, id DESC
      LIMIT 1
    `, [productId, date]);

    // Resolve cost price at specific date
    const costRecord = await db.queryOne<any>(`
      SELECT cost_price, effective_from
      FROM cost_price_history
      WHERE product_id = ? AND effective_from <= ?
      ORDER BY effective_from DESC, id DESC
      LIMIT 1
    `, [productId, date]);

    const resolvedSellingPrice = priceRecord ? Number(priceRecord.price) : Number(product.current_selling_price);
    const resolvedCostPrice = costRecord ? Number(costRecord.cost_price) : Number(product.current_cost_price);

    return NextResponse.json({
      success: true,
      data: {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        currentStock: Number(product.current_stock),
        status: product.status,
        date,
        sellingPrice: resolvedSellingPrice,
        costPrice: resolvedCostPrice,
        priceEffectiveFrom: priceRecord?.effective_from || null,
        costEffectiveFrom: costRecord?.effective_from || null,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
