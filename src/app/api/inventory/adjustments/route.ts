import { NextRequest, NextResponse } from 'next/server';
import { db, runTransaction } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { MovementType } from '@/lib/types';

const ALLOWED_ADJUSTMENT_TYPES: MovementType[] = [
  'DAMAGE',
  'LOSS',
  'GIFT',
  'RETURN',
  'ADJUSTMENT',
];

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Chỉ Admin mới có quyền điều chỉnh kho.' } },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      productId,
      movementType,
      quantityChange,
      movementDate,
      note,
    } = body;

    const qtyChange = parseInt(quantityChange, 10);
    const date = movementDate || new Date().toISOString().split('T')[0];

    if (!productId || !ALLOWED_ADJUSTMENT_TYPES.includes(movementType) || isNaN(qtyChange) || qtyChange === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Vui lòng chọn sản phẩm, loại điều chỉnh hợp lệ và số lượng thay đổi khác 0.',
          },
        },
        { status: 400 }
      );
    }

    const adjustmentResult = runTransaction((database) => {
      const product = database.prepare('SELECT id, sku, name, current_stock FROM products WHERE id = ?').get(productId) as any;
      if (!product) {
        throw new Error('Sản phẩm không tồn tại.');
      }

      const newStock = product.current_stock + qtyChange;
      if (newStock < 0) {
        throw new Error(`Số lượng tồn không thể âm (Hiện tại: ${product.current_stock}, Điều chỉnh: ${qtyChange}, Tồn mới: ${newStock}).`);
      }

      // 1. Insert stock movement
      const movementInfo = database.prepare(`
        INSERT INTO stock_movements (
          product_id, movement_type, quantity_change, balance_after,
          movement_date, reference_type, note, created_by
        ) VALUES (?, ?, ?, ?, ?, 'stock_adjustments', ?, ?)
      `).run(
        productId,
        movementType,
        qtyChange,
        newStock,
        date,
        note ? note.trim() : `Điều chỉnh kho (${movementType})`,
        user.id
      );

      // 2. Update cached stock in products table
      database.prepare(`
        UPDATE products
        SET current_stock = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newStock, productId);

      // 3. Insert Audit Log
      database.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_name, entity_id, old_value_json, new_value_json)
        VALUES (?, 'STOCK_ADJUSTMENT', 'STOCK_MOVEMENTS', ?, ?, ?)
      `).run(
        user.id,
        movementInfo.lastInsertRowid.toString(),
        JSON.stringify({ stock_before: product.current_stock }),
        JSON.stringify({ movementType, qtyChange, balance_after: newStock, note })
      );

      return {
        id: movementInfo.lastInsertRowid,
        productId,
        productName: product.name,
        movementType,
        quantityChange: qtyChange,
        balanceAfter: newStock,
        movementDate: date,
        note,
      };
    });

    return NextResponse.json({
      success: true,
      data: adjustmentResult,
      message: 'Đã điều chỉnh kho thành công.',
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'ADJUSTMENT_ERROR', message: error.message || 'Lỗi xử lý điều chỉnh kho.' },
      },
      { status: 400 }
    );
  }
}
