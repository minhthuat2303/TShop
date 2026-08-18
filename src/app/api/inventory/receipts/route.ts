import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Chỉ Admin mới có quyền nhập kho.' } },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      productId,
      importDate,
      quantity,
      unitCostPrice,
      supplierId,
      note,
    } = body;

    const qty = parseInt(quantity, 10);
    const cost = parseFloat(unitCostPrice);
    const date = importDate || new Date().toISOString().split('T')[0];

    if (!productId || isNaN(qty) || qty <= 0 || isNaN(cost) || cost < 0) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_INPUT', message: 'Vui lòng điền đúng sản phẩm, số lượng (>0) và đơn giá nhập (>=0).' },
        },
        { status: 400 }
      );
    }

    const receiptResult = await db.transaction(async (tx) => {
      const product = await tx.queryOne<any>('SELECT id, sku, name, current_stock, current_cost_price FROM products WHERE id = ?', [productId]);
      if (!product) {
        throw new Error('Sản phẩm không tồn tại.');
      }

      const totalAmount = qty * cost;
      const cleanDate = date.replace(/-/g, '');
      const importCode = `NK-${cleanDate}-${Date.now().toString().slice(-4)}`;
      const lotCode = `LOT-${cleanDate}-${product.sku}-${Date.now().toString().slice(-4)}`;

      // 1. Create Import Header
      const importInfo = await tx.execute(`
        INSERT INTO imports (import_code, supplier_id, import_date, total_amount, note, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [importCode, supplierId || null, date, totalAmount, note ? note.trim() : null, user.id]);

      const importId = Number(importInfo.lastInsertId);

      // 2. Create Import Item
      await tx.execute(`
        INSERT INTO import_items (import_id, product_id, quantity, unit_cost_price, total_amount)
        VALUES (?, ?, ?, ?, ?)
      `, [importId, productId, qty, cost, totalAmount]);

      // 3. Create INVENTORY LOT (FIFO tracking)
      const lotInfo = await tx.execute(`
        INSERT INTO inventory_lots (
          lot_code, product_id, purchase_date, quantity_received, quantity_remaining,
          unit_cost, supplier_id, import_id, note, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        lotCode,
        productId,
        date,
        qty,
        qty,
        cost,
        supplierId || null,
        importId,
        note ? note.trim() : `Nhập kho phiếu ${importCode}`,
        user.id
      ]);

      const lotId = Number(lotInfo.lastInsertId);

      // 4. Insert Cost Price History
      await tx.execute(`
        INSERT INTO cost_price_history (product_id, cost_price, effective_from, note, created_by)
        VALUES (?, ?, ?, ?, ?)
      `, [productId, cost, date, `Nhập kho theo phiếu ${importCode} (Lô ${lotCode})`, user.id]);

      // 5. Calculate weighted average cost of all remaining lots for this product
      const remainingLotsSummary = await tx.queryOne<any>(`
        SELECT 
          COALESCE(SUM(quantity_remaining), 0) as total_rem,
          COALESCE(SUM(quantity_remaining * unit_cost), 0) as total_val
        FROM inventory_lots
        WHERE product_id = ? AND quantity_remaining > 0
      `, [productId]);

      const totalRem = Number(remainingLotsSummary?.total_rem || 0);
      const totalVal = Number(remainingLotsSummary?.total_val || 0);

      const newStock = Number(product.current_stock) + qty;
      const weightedAvgCost = totalRem > 0
        ? Math.round(totalVal / totalRem)
        : cost;

      // 6. Update Product Stock & Weighted Average Cost
      await tx.execute(`
        UPDATE products
        SET current_stock = ?,
            current_cost_price = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [newStock, weightedAvgCost, productId]);

      // 7. Create Stock Movement (PURCHASE)
      await tx.execute(`
        INSERT INTO stock_movements (
          product_id, movement_type, quantity_change, balance_after,
          movement_date, reference_type, reference_id, note, created_by
        ) VALUES (?, 'PURCHASE', ?, ?, ?, 'imports', ?, ?, ?)
      `, [
        productId,
        qty,
        newStock,
        date,
        importId,
        `Nhập kho phiếu ${importCode} (Lô: ${lotCode})` + (note ? `: ${note}` : ''),
        user.id
      ]);

      // 8. Audit Log
      await tx.execute(`
        INSERT INTO audit_logs (user_id, action, entity_name, entity_id, new_value_json)
        VALUES (?, 'STOCK_IMPORT_LOT', 'INVENTORY_LOTS', ?, ?)
      `, [user.id, (lotId || 0).toString(), JSON.stringify({
        import_code: importCode,
        lot_code: lotCode,
        product_sku: product.sku,
        quantity: qty,
        unit_cost: cost,
        total_amount: totalAmount,
        balance_after: newStock,
      })]);

      return {
        importId,
        importCode,
        lotId,
        lotCode,
        productId,
        productName: product.name,
        quantity: qty,
        unitCostPrice: cost,
        totalAmount,
        balanceAfter: newStock,
        importDate: date,
      };
    });

    return NextResponse.json({
      success: true,
      data: receiptResult,
      message: 'Nhập kho và khởi tạo lô hàng thành công.',
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'IMPORT_ERROR', message: error.message || 'Lỗi xử lý nhập kho.' },
      },
      { status: 400 }
    );
  }
}
