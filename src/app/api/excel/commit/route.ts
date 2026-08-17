import { NextRequest, NextResponse } from 'next/server';
import { db, runTransaction } from '@/lib/db';
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

    const result = runTransaction((database) => {
      let createdCount = 0;
      let updatedCount = 0;

      // 1. Process Creates
      for (const item of creates) {
        const info = database.prepare(`
          INSERT INTO products (
            sku, name, category_id, product_type_id,
            current_cost_price, current_selling_price, current_stock,
            min_stock_alert, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
        `).run(
          item.sku,
          item.name,
          item.category_id,
          item.product_type_id,
          item.cost_price || 0,
          item.selling_price || 0,
          item.stock || 0,
          item.min_stock_alert || 5
        );

        const newId = Number(info.lastInsertRowid);

        // Price history
        database.prepare(`
          INSERT INTO price_history (product_id, price, effective_from, note, created_by)
          VALUES (?, ?, ?, 'Khởi tạo từ Import Excel', ?)
        `).run(newId, item.selling_price || 0, today, user.id);

        // Cost history
        database.prepare(`
          INSERT INTO cost_price_history (product_id, cost_price, effective_from, note, created_by)
          VALUES (?, ?, ?, 'Khởi tạo từ Import Excel', ?)
        `).run(newId, item.cost_price || 0, today, user.id);

        // Stock movement if initial stock > 0
        if (Number(item.stock) > 0) {
          database.prepare(`
            INSERT INTO stock_movements (
              product_id, movement_type, quantity_change, balance_after,
              movement_date, reference_type, note, created_by
            ) VALUES (?, 'PURCHASE', ?, ?, ?, 'EXCEL_IMPORT', 'Tồn kho ban đầu từ file Excel', ?)
          `).run(newId, Number(item.stock), Number(item.stock), today, user.id);
        }

        createdCount++;
      }

      // 2. Process Updates
      for (const item of updates) {
        const old = database.prepare('SELECT * FROM products WHERE id = ?').get(item.id) as any;
        if (!old) continue;

        // If price changed, append to price_history
        if (Number(item.selling_price) !== Number(old.current_selling_price)) {
          database.prepare(`
            INSERT INTO price_history (product_id, price, effective_from, note, created_by)
            VALUES (?, ?, ?, 'Cập nhật từ file Excel', ?)
          `).run(item.id, item.selling_price, today, user.id);
        }

        // If cost changed, append to cost_price_history
        if (Number(item.cost_price) !== Number(old.current_cost_price)) {
          database.prepare(`
            INSERT INTO cost_price_history (product_id, cost_price, effective_from, note, created_by)
            VALUES (?, ?, ?, 'Cập nhật từ file Excel', ?)
          `).run(item.id, item.cost_price, today, user.id);
        }

        // Update product master record
        database.prepare(`
          UPDATE products
          SET name = ?,
              category_id = ?,
              product_type_id = ?,
              current_cost_price = ?,
              current_selling_price = ?,
              min_stock_alert = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          item.name,
          item.category_id,
          item.product_type_id,
          item.cost_price,
          item.selling_price,
          item.min_stock_alert || 5,
          item.id
        );

        updatedCount++;
      }

      // 3. Save Import Log
      database.prepare(`
        INSERT INTO import_logs (
          file_name, entity_type, total_rows, valid_rows, error_rows,
          created_rows, updated_rows, status, details_json, created_by
        ) VALUES (?, ?, ?, ?, 0, ?, ?, 'SUCCESS', ?, ?)
      `).run(
        fileName || 'upload.xlsx',
        entityType || 'products',
        createdCount + updatedCount,
        createdCount + updatedCount,
        createdCount,
        updatedCount,
        JSON.stringify({ created: createdCount, updated: updatedCount }),
        user.id
      );

      // 4. Save Audit Log
      database.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_name, entity_id, new_value_json)
        VALUES (?, 'EXCEL_COMMIT', 'EXCEL_IMPORT', '0', ?)
      `).run(user.id, JSON.stringify({ fileName, created: createdCount, updated: updatedCount }));

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
