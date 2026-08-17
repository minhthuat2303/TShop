import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db, runTransaction } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Chỉ Admin mới có quyền nhập kho qua Excel.' } },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const isCommit = formData.get('commit') === 'true';
    const importDate = (formData.get('importDate') as string) || new Date().toISOString().split('T')[0];

    if (!file) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_FILE', message: 'Vui lòng chọn file Excel.' } },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(Buffer.from(arrayBuffer), { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      return NextResponse.json(
        { success: false, error: { code: 'EMPTY_SHEET', message: 'File Excel không có dữ liệu sheet.' } },
        { status: 400 }
      );
    }

    const rawRows = XLSX.utils.sheet_to_json<any>(workbook.Sheets[firstSheetName]);

    if (!rawRows || rawRows.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'EMPTY_FILE', message: 'File Excel trống.' } },
        { status: 400 }
      );
    }

    // Load active products map
    const products = db.prepare("SELECT id, sku, name, current_stock, current_cost_price FROM products WHERE status = 'ACTIVE'").all() as any[];
    const prodMap = new Map<string, any>();
    products.forEach((p) => prodMap.set(p.sku.toUpperCase(), p));

    const validRows: any[] = [];
    const errorRows: any[] = [];
    const skippedRows: any[] = [];

    rawRows.forEach((row, idx) => {
      const rowNumber = idx + 2;
      const skuRaw = row['Mã SKU (*)'] || row['Mã SKU'] || row['SKU'] || row['sku'];
      const importQtyRaw = row['Số lượng nhập kho (*)'] ?? row['Số lượng nhập'] ?? row['SL nhập'] ?? row['quantity'];
      const newCostRaw = row['Giá nhập mới (nếu đổi)'] ?? row['Giá nhập thực tế'] ?? row['cost_price'];
      const noteRaw = row['Ghi chú'] ?? row['note'] ?? '';

      if (!skuRaw) {
        skippedRows.push({ rowNumber, message: 'Dòng trống SKU.' });
        return;
      }

      const sku = String(skuRaw).trim().toUpperCase();
      const product = prodMap.get(sku);

      if (!product) {
        errorRows.push({ rowNumber, sku, message: `Mã SKU '${sku}' không tồn tại hoặc đã ngừng kinh doanh.` });
        return;
      }

      // If user left import quantity empty or 0, skip this product
      if (importQtyRaw === undefined || importQtyRaw === null || importQtyRaw === '' || Number(importQtyRaw) === 0) {
        skippedRows.push({ rowNumber, sku, name: product.name, message: 'Không nhập số lượng (Bỏ qua).' });
        return;
      }

      const importQty = parseInt(importQtyRaw, 10);
      if (isNaN(importQty) || importQty < 0) {
        errorRows.push({ rowNumber, sku, message: `Số lượng nhập không hợp lệ: '${importQtyRaw}'.` });
        return;
      }

      const unitCost = newCostRaw !== undefined && newCostRaw !== null && String(newCostRaw).trim() !== ''
        ? parseFloat(newCostRaw)
        : product.current_cost_price;

      if (isNaN(unitCost) || unitCost < 0) {
        errorRows.push({ rowNumber, sku, message: `Đơn giá nhập không hợp lệ: '${newCostRaw}'.` });
        return;
      }

      validRows.push({
        rowNumber,
        productId: product.id,
        sku: product.sku,
        name: product.name,
        currentStock: product.current_stock,
        importQuantity: importQty,
        balanceAfter: product.current_stock + importQty,
        unitCostPrice: unitCost,
        totalAmount: importQty * unitCost,
        note: String(noteRaw).trim(),
      });
    });

    // If this is just a Preview request, return preview data
    if (!isCommit) {
      return NextResponse.json({
        success: true,
        preview: true,
        fileName: file.name,
        importDate,
        totalRows: rawRows.length,
        validRows,
        errorRows,
        skippedRows,
        totalImportItems: validRows.reduce((sum, r) => sum + r.importQuantity, 0),
        totalImportAmount: validRows.reduce((sum, r) => sum + r.totalAmount, 0),
      });
    }

    // Execute Commit Transaction
    if (validRows.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_VALID_DATA', message: 'Không có dòng dữ liệu nhập kho hợp lệ nào để áp dụng.' } },
        { status: 400 }
      );
    }

    const commitResult = runTransaction((database) => {
      const cleanDate = importDate.replace(/-/g, '');
      const importCode = `NK-EXCEL-${cleanDate}-${Date.now().toString().slice(-4)}`;
      const totalAmount = validRows.reduce((sum, r) => sum + r.totalAmount, 0);

      // 1. Create Import Header
      const headerInfo = database.prepare(`
        INSERT INTO imports (import_code, supplier_id, import_date, total_amount, note, created_by)
        VALUES (?, NULL, ?, ?, ?, ?)
      `).run(
        importCode,
        importDate,
        totalAmount,
        `Nhập kho hàng loạt từ file Excel: ${file.name}`,
        user.id
      );

      const importId = Number(headerInfo.lastInsertRowid);

      // 2. Process each valid row
      for (const row of validRows) {
        const lotCode = `LOT-${cleanDate}-${row.sku}-${Date.now().toString().slice(-4)}${Math.floor(100 + Math.random() * 900)}`;

        // Insert import item
        database.prepare(`
          INSERT INTO import_items (import_id, product_id, quantity, unit_cost_price, total_amount)
          VALUES (?, ?, ?, ?, ?)
        `).run(importId, row.productId, row.importQuantity, row.unitCostPrice, row.totalAmount);

        // Create Inventory Lot for FIFO
        database.prepare(`
          INSERT INTO inventory_lots (
            lot_code, product_id, purchase_date, quantity_received, quantity_remaining,
            unit_cost, supplier_id, import_id, note, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
        `).run(
          lotCode,
          row.productId,
          importDate,
          row.importQuantity,
          row.importQuantity,
          row.unitCostPrice,
          importId,
          `Nhập kho Excel ${importCode}` + (row.note ? `: ${row.note}` : ''),
          user.id
        );

        // Update cost price history if price specified
        database.prepare(`
          INSERT INTO cost_price_history (product_id, cost_price, effective_from, note, created_by)
          VALUES (?, ?, ?, ?, ?)
        `).run(row.productId, row.unitCostPrice, importDate, `Nhập kho Excel phiếu ${importCode} (Lô ${lotCode})`, user.id);

        // Calculate weighted average cost of remaining lots
        const remainingLotsSummary = database.prepare(`
          SELECT 
            COALESCE(SUM(quantity_remaining), 0) as total_rem,
            COALESCE(SUM(quantity_remaining * unit_cost), 0) as total_val
          FROM inventory_lots
          WHERE product_id = ? AND quantity_remaining > 0
        `).get(row.productId) as { total_rem: number; total_val: number };

        const weightedAvgCost = remainingLotsSummary.total_rem > 0
          ? Math.round(remainingLotsSummary.total_val / remainingLotsSummary.total_rem)
          : row.unitCostPrice;

        // Update product current stock and current cost price
        database.prepare(`
          UPDATE products
          SET current_stock = ?,
              current_cost_price = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(row.balanceAfter, weightedAvgCost, row.productId);

        // Insert stock movements (PURCHASE)
        database.prepare(`
          INSERT INTO stock_movements (
            product_id, movement_type, quantity_change, balance_after,
            movement_date, reference_type, reference_id, note, created_by
          ) VALUES (?, 'PURCHASE', ?, ?, ?, 'imports', ?, ?, ?)
        `).run(
          row.productId,
          row.importQuantity,
          row.balanceAfter,
          importDate,
          importId,
          `Nhập kho Excel ${importCode} (Lô: ${lotCode})` + (row.note ? `: ${row.note}` : ''),
          user.id
        );
      }

      // 3. Log Audit
      database.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_name, entity_id, new_value_json)
        VALUES (?, 'STOCK_IMPORT_EXCEL', 'IMPORTS', ?, ?)
      `).run(user.id, importId.toString(), JSON.stringify({
        import_code: importCode,
        file_name: file.name,
        item_count: validRows.length,
        total_quantity: validRows.reduce((sum, r) => sum + r.importQuantity, 0),
        total_amount: totalAmount,
      }));

      return {
        importId,
        importCode,
        itemCount: validRows.length,
        totalQuantity: validRows.reduce((sum, r) => sum + r.importQuantity, 0),
        totalAmount,
      };
    });

    return NextResponse.json({
      success: true,
      data: commitResult,
      message: `Đã nhập kho thành công ${commitResult.itemCount} sản phẩm (Tổng cộng: ${commitResult.totalQuantity} món).`,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'IMPORT_ERROR', message: error.message || 'Lỗi nhập kho từ Excel.' } },
      { status: 500 }
    );
  }
}
