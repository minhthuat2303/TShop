import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Chỉ Admin mới có quyền lưu dữ liệu Excel.' } },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { fileName, entityType, creates = [], updates = [] } = body;

    const today = new Date().toISOString().split('T')[0];

    const result = await db.transaction(async (tx) => {
      let createdCount = 0;
      let updatedCount = 0;

      // 1. Process Creates
      for (const item of creates) {
        const info = await tx.execute(`
          INSERT INTO products (
            sku, name, category_id, product_type_id,
            current_cost_price, current_selling_price, current_stock,
            min_stock_alert, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
        `, [
          item.sku,
          item.name,
          item.category_id,
          item.product_type_id,
          item.cost_price || 0,
          item.selling_price || 0,
          item.stock || 0,
          item.min_stock_alert || 5
        ]);

        const newId = Number(info.lastInsertId);

        // Price history
        await tx.execute(`
          INSERT INTO price_history (product_id, price, effective_from, note, created_by)
          VALUES (?, ?, ?, 'Khởi tạo từ Import Excel', ?)
        `, [newId, item.selling_price || 0, today, user.id]);

        // Cost history
        await tx.execute(`
          INSERT INTO cost_price_history (product_id, cost_price, effective_from, note, created_by)
          VALUES (?, ?, ?, 'Khởi tạo từ Import Excel', ?)
        `, [newId, item.cost_price || 0, today, user.id]);

        // Stock movement if initial stock > 0
        if (Number(item.stock) > 0) {
          await tx.execute(`
            INSERT INTO stock_movements (
              product_id, movement_type, quantity_change, balance_after,
              movement_date, reference_type, note, created_by
            ) VALUES (?, 'PURCHASE', ?, ?, ?, 'EXCEL_IMPORT', 'Tồn kho ban đầu từ file Excel', ?)
          `, [newId, Number(item.stock), Number(item.stock), today, user.id]);

          const lotCode = `LOT-INIT-${item.sku}-${Date.now().toString().slice(-4)}`;
          await tx.execute(`
            INSERT INTO inventory_lots (lot_code, product_id, purchase_date, quantity_received, quantity_remaining, unit_cost, note, created_by)
            VALUES (?, ?, ?, ?, ?, ?, 'Khởi tạo lô ban đầu từ file Excel', ?)
          `, [lotCode, newId, today, Number(item.stock), Number(item.stock), Number(item.cost_price) || 0, user.id]);
        }

        createdCount++;
      }

      // 2. Process Updates
      for (const item of updates) {
        const old = await tx.queryOne<any>('SELECT * FROM products WHERE id = ?', [item.id]);
        if (!old) continue;

        if (Number(item.selling_price) !== Number(old.current_selling_price)) {
          await tx.execute(`
            INSERT INTO price_history (product_id, price, effective_from, note, created_by)
            VALUES (?, ?, ?, 'Cập nhật từ file Excel', ?)
          `, [item.id, item.selling_price, today, user.id]);
        }

        if (Number(item.cost_price) !== Number(old.current_cost_price)) {
          await tx.execute(`
            INSERT INTO cost_price_history (product_id, cost_price, effective_from, note, created_by)
            VALUES (?, ?, ?, 'Cập nhật từ file Excel', ?)
          `, [item.id, item.cost_price, today, user.id]);
        }

        await tx.execute(`
          UPDATE products
          SET name = ?,
              category_id = ?,
              product_type_id = ?,
              current_cost_price = ?,
              current_selling_price = ?,
              min_stock_alert = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [
          item.name,
          item.category_id,
          item.product_type_id,
          item.cost_price,
          item.selling_price,
          item.min_stock_alert || 5,
          item.id
        ]);

        updatedCount++;
      }

      // 3. Save Import Log
      await tx.execute(`
        INSERT INTO import_logs (
          file_name, entity_type, total_rows, valid_rows, error_rows,
          created_rows, updated_rows, status, details_json, created_by
        ) VALUES (?, ?, ?, ?, 0, ?, ?, 'SUCCESS', ?, ?)
      `, [
        fileName || 'upload.xlsx',
        entityType || 'products',
        createdCount + updatedCount,
        createdCount + updatedCount,
        createdCount,
        updatedCount,
        JSON.stringify({ created: createdCount, updated: updatedCount }),
        user.id
      ]);

      // 4. Save Audit Log
      await tx.execute(`
        INSERT INTO audit_logs (user_id, action, entity_name, entity_id, new_value_json)
        VALUES (?, 'EXCEL_COMMIT', 'EXCEL_IMPORT', '0', ?)
      `, [user.id, JSON.stringify({ fileName, created: createdCount, updated: updatedCount })]);

      return { createdCount, updatedCount };
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: `Đã áp dụng thành công ${result.createdCount} sản phẩm mới và ${result.updatedCount} sản phẩm cập nhật.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'COMMIT_ERROR', message: error.message || 'Lỗi lưu dữ liệu Excel.' } },
      { status: 500 }
    );
  }
}
