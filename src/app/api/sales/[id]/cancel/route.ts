import { NextRequest, NextResponse } from 'next/server';
import { db, runTransaction } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(request);
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Chỉ Quản trị viên mới có quyền hủy phiếu bán hàng.' } },
        { status: 403 }
      );
    }

    const { id } = await params;
    const saleId = parseInt(id, 10);

    if (isNaN(saleId)) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_ID', message: 'ID giao dịch không hợp lệ.' } },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const reason = body.reason?.trim() || 'Khách hủy mua / Tạo nhầm phiếu';

    const cancelResult = runTransaction((database) => {
      // 1. Fetch sale record
      const sale = database.prepare(`
        SELECT id, transaction_code, product_id, sale_date, quantity, 
               unit_price_at_sale, discount, total_revenue, total_cost, profit, status
        FROM sales_records
        WHERE id = ?
      `).get(saleId) as any;

      if (!sale) {
        throw new Error('Không tìm thấy phiếu bán hàng cần hủy.');
      }

      if (sale.status === 'CANCELLED') {
        throw new Error(`Phiếu bán hàng [${sale.transaction_code}] đã được hủy trước đó.`);
      }

      // 2. Fetch product
      const product = database.prepare(`
        SELECT id, sku, name, current_stock, current_cost_price
        FROM products
        WHERE id = ?
      `).get(sale.product_id) as any;

      if (!product) {
        throw new Error('Sản phẩm liên kết không tồn tại.');
      }

      // 3. Revert FIFO Lot allocations
      const allocations = database.prepare(`
        SELECT inventory_lot_id, quantity, unit_cost, total_cost
        FROM sale_cost_allocations
        WHERE sale_id = ?
      `).all(saleId) as any[];

      for (const alloc of allocations) {
        database.prepare(`
          UPDATE inventory_lots
          SET quantity_remaining = quantity_remaining + ?
          WHERE id = ?
        `).run(alloc.quantity, alloc.inventory_lot_id);
      }

      // 4. Update Product Stock and Recalculate Weighted Average Cost
      const newStock = product.current_stock + sale.quantity;

      const remainingLotsSummary = database.prepare(`
        SELECT 
          COALESCE(SUM(quantity_remaining), 0) as total_rem,
          COALESCE(SUM(quantity_remaining * unit_cost), 0) as total_val
        FROM inventory_lots
        WHERE product_id = ? AND quantity_remaining > 0
      `).get(sale.product_id) as { total_rem: number; total_val: number };

      const weightedAvgCost = remainingLotsSummary.total_rem > 0
        ? Math.round(remainingLotsSummary.total_val / remainingLotsSummary.total_rem)
        : product.current_cost_price;

      database.prepare(`
        UPDATE products
        SET current_stock = ?,
            current_cost_price = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newStock, weightedAvgCost, sale.product_id);

      // 5. Create Stock Movement (Type = RETURN or ADJUSTMENT)
      const now = new Date().toISOString().split('T')[0];
      database.prepare(`
        INSERT INTO stock_movements (
          product_id, movement_type, quantity_change, balance_after,
          movement_date, reference_type, reference_id, note, created_by
        ) VALUES (?, 'RETURN', ?, ?, ?, 'sales_records', ?, ?, ?)
      `).run(
        sale.product_id,
        sale.quantity,
        newStock,
        now,
        sale.id,
        `Hoàn tồn do hủy phiếu bán [${sale.transaction_code}]: ${reason}`,
        user.id
      );

      // 6. Update Sales Record status to CANCELLED
      database.prepare(`
        UPDATE sales_records
        SET status = 'CANCELLED',
            cancel_reason = ?,
            cancelled_at = CURRENT_TIMESTAMP,
            cancelled_by = ?
        WHERE id = ?
      `).run(reason, user.id, saleId);

      // 7. Audit Log
      database.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_name, entity_id, new_value_json)
        VALUES (?, 'CANCEL_SALE', 'SALES_RECORDS', ?, ?)
      `).run(user.id, saleId.toString(), JSON.stringify({
        transaction_code: sale.transaction_code,
        product_sku: product.sku,
        product_name: product.name,
        quantity_restored: sale.quantity,
        revenue_cancelled: sale.total_revenue,
        cogs_cancelled: sale.total_cost,
        profit_cancelled: sale.profit,
        reason: reason,
        new_stock: newStock,
      }));

      return {
        saleId,
        transactionCode: sale.transaction_code,
        productName: product.name,
        quantityRestored: sale.quantity,
        newStock,
        cancelledRevenue: sale.total_revenue,
      };
    });

    return NextResponse.json({
      success: true,
      data: cancelResult,
      message: `Đã hủy thành công phiếu bán [${cancelResult.transactionCode}] và hoàn lại ${cancelResult.quantityRestored} sản phẩm vào kho.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'CANCEL_ERROR', message: error.message || 'Lỗi hủy phiếu bán hàng.' } },
      { status: 400 }
    );
  }
}
