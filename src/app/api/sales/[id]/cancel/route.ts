import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
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

    const cancelResult = await db.transaction(async (tx) => {
      // 1. Fetch sale record
      const sale = await tx.queryOne<any>(`
        SELECT id, transaction_code, product_id, sale_date, quantity, 
               unit_price_at_sale, discount, total_revenue, total_cost, profit, status
        FROM sales_records
        WHERE id = ?
      `, [saleId]);

      if (!sale) {
        throw new Error('Không tìm thấy phiếu bán hàng cần hủy.');
      }

      if (sale.status === 'CANCELLED') {
        throw new Error(`Phiếu bán hàng [${sale.transaction_code}] đã được hủy trước đó.`);
      }

      // 2. Fetch product
      const product = await tx.queryOne<any>(`
        SELECT id, sku, name, current_stock, current_cost_price
        FROM products
        WHERE id = ?
      `, [sale.product_id]);

      if (!product) {
        throw new Error('Sản phẩm liên kết không tồn tại.');
      }

      // 3. Revert FIFO Lot allocations
      const allocations = await tx.query<any>(`
        SELECT inventory_lot_id, quantity, unit_cost, total_cost
        FROM sale_cost_allocations
        WHERE sale_id = ?
      `, [saleId]);

      for (const alloc of allocations) {
        await tx.execute(`
          UPDATE inventory_lots
          SET quantity_remaining = quantity_remaining + ?
          WHERE id = ?
        `, [Number(alloc.quantity), alloc.inventory_lot_id]);
      }

      // 4. Update Product Stock and Recalculate Weighted Average Cost
      const newStock = Number(product.current_stock) + Number(sale.quantity);

      const remainingLotsSummary = await tx.queryOne<any>(`
        SELECT 
          COALESCE(SUM(quantity_remaining), 0) as total_rem,
          COALESCE(SUM(quantity_remaining * unit_cost), 0) as total_val
        FROM inventory_lots
        WHERE product_id = ? AND quantity_remaining > 0
      `, [sale.product_id]);

      const totalRem = Number(remainingLotsSummary?.total_rem || 0);
      const totalVal = Number(remainingLotsSummary?.total_val || 0);

      const weightedAvgCost = totalRem > 0
        ? Math.round(totalVal / totalRem)
        : Number(product.current_cost_price);

      await tx.execute(`
        UPDATE products
        SET current_stock = ?,
            current_cost_price = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [newStock, weightedAvgCost, sale.product_id]);

      // 5. Create Stock Movement (Type = RETURN)
      const now = new Date().toISOString().split('T')[0];
      await tx.execute(`
        INSERT INTO stock_movements (
          product_id, movement_type, quantity_change, balance_after,
          movement_date, reference_type, reference_id, note, created_by
        ) VALUES (?, 'RETURN', ?, ?, ?, 'sales_records', ?, ?, ?)
      `, [
        sale.product_id,
        Number(sale.quantity),
        newStock,
        now,
        sale.id,
        `Hoàn tồn do hủy phiếu bán [${sale.transaction_code}]: ${reason}`,
        user.id
      ]);

      // 6. Update Sales Record status to CANCELLED
      await tx.execute(`
        UPDATE sales_records
        SET status = 'CANCELLED',
            cancel_reason = ?,
            cancelled_at = CURRENT_TIMESTAMP,
            cancelled_by = ?
        WHERE id = ?
      `, [reason, user.id, saleId]);

      // 7. Audit Log
      await tx.execute(`
        INSERT INTO audit_logs (user_id, action, entity_name, entity_id, new_value_json)
        VALUES (?, 'CANCEL_SALE', 'SALES_RECORDS', ?, ?)
      `, [user.id, saleId.toString(), JSON.stringify({
        transaction_code: sale.transaction_code,
        product_sku: product.sku,
        product_name: product.name,
        quantity_restored: sale.quantity,
        revenue_cancelled: sale.total_revenue,
        cogs_cancelled: sale.total_cost,
        profit_cancelled: sale.profit,
        reason: reason,
        new_stock: newStock,
      })]);

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
