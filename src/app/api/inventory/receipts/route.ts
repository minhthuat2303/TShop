import { NextRequest, NextResponse } from 'next/server';
import { db, runTransaction } from '@/lib/db';
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

    const receiptResult = runTransaction((database) => {
      const product = database.prepare('SELECT id, sku, name, current_stock, current_cost_price FROM products WHERE id = ?').get(productId) as any;
      if (!product) {
        throw new Error('Sản phẩm không tồn tại.');
      }

      const totalAmount = qty * cost;
      const cleanDate = date.replace(/-/g, '');
      const importCode = `NK-${cleanDate}-${Date.now().toString().slice(-4)}`;
      const lotCode = `LOT-${cleanDate}-${product.sku}-${Date.now().toString().slice(-4)}`;

      // 1. Create Import Header
      const importInfo = database.prepare(`
        INSERT INTO imports (import_code, supplier_id, import_date, total_amount, note, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(importCode, supplierId || null, date, totalAmount, note ? note.trim() : null, user.id);

      const importId = Number(importInfo.lastInsertRowid);

      // 2. Create Import Item
      database.prepare(`
        INSERT INTO import_items (import_id, product_id, quantity, unit_cost_price, total_amount)
        VALUES (?, ?, ?, ?, ?)
      `).run(importId, productId, qty, cost, totalAmount);

      // 3. Create INVENTORY LOT (FIFO tracking)
      const lotInfo = database.prepare(`
        INSERT INTO inventory_lots (
          lot_code, product_id, purchase_date, quantity_received, quantity_remaining,
          unit_cost, supplier_id, import_id, note, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
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
      );

      const lotId = Number(lotInfo.lastInsertRowid);

      // 4. Insert Cost Price History
      database.prepare(`
        INSERT INTO cost_price_history (product_id, cost_price, effective_from, note, created_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(productId, cost, date, `Nhập kho theo phiếu ${importCode} (Lô ${lotCode})`, user.id);

      // 5. Calculate weighted average cost of all remaining lots for this product
      const remainingLotsSummary = database.prepare(`
        SELECT 
          COALESCE(SUM(quantity_remaining), 0) as total_rem,
          COALESCE(SUM(quantity_remaining * unit_cost), 0) as total_val
        FROM inventory_lots
        WHERE product_id = ? AND quantity_remaining > 0
      `).get(productId) as { total_rem: number; total_val: number };

      const newStock = product.current_stock + qty;
      const weightedAvgCost = remainingLotsSummary.total_rem > 0
        ? Math.round(remainingLotsSummary.total_val / remainingLotsSummary.total_rem)
        : cost;

      // 6. Update Product Stock & Weighted Average Cost
      database.prepare(`
        UPDATE products
        SET current_stock = ?,
            current_cost_price = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newStock, weightedAvgCost, productId);

      // 7. Create Stock Movement (PURCHASE)
      database.prepare(`
        INSERT INTO stock_movements (
          product_id, movement_type, quantity_change, balance_after,
          movement_date, reference_type, reference_id, note, created_by
        ) VALUES (?, 'PURCHASE', ?, ?, ?, 'imports', ?, ?, ?)
      `).run(
        productId,
        qty,
        newStock,
        date,
        importId,
        `Nhập kho phiếu ${importCode} (Lô: ${lotCode})` + (note ? `: ${note}` : ''),
        user.id
      );

      // 8. Audit Log
      database.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_name, entity_id, new_value_json)
        VALUES (?, 'STOCK_IMPORT_LOT', 'INVENTORY_LOTS', ?, ?)
      `).run(user.id, lotId.toString(), JSON.stringify({
        import_code: importCode,
        lot_code: lotCode,
        product_sku: product.sku,
        quantity: qty,
        unit_cost: cost,
        total_amount: totalAmount,
        balance_after: newStock,
      }));

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
