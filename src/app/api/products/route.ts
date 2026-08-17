import { NextRequest, NextResponse } from 'next/server';
import { db, runTransaction } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const categoryId = searchParams.get('categoryId');
    const productTypeId = searchParams.get('productTypeId');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

    let whereClauses: string[] = [];
    let params: any[] = [];

    if (q) {
      whereClauses.push(`(p.sku LIKE ? OR p.name LIKE ?)`);
      params.push(`%${q}%`, `%${q}%`);
    }

    if (categoryId) {
      whereClauses.push(`p.category_id = ?`);
      params.push(categoryId);
    }

    if (productTypeId) {
      whereClauses.push(`p.product_type_id = ?`);
      params.push(productTypeId);
    }

    if (status) {
      whereClauses.push(`p.status = ?`);
      params.push(status);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countResult = db.prepare(`
      SELECT COUNT(*) as total
      FROM products p
      ${whereSql}
    `).get(...params) as { total: number };

    const total = countResult.total;
    const totalPages = Math.ceil(total / limit);

    const products = db.prepare(`
      SELECT 
        p.id, p.sku, p.name, p.category_id, p.product_type_id,
        p.current_cost_price, p.current_selling_price, p.current_stock,
        p.min_stock_alert, p.status, p.created_at, p.updated_at,
        c.name as category_name,
        pt.name as product_type_name
      FROM products p
      JOIN categories c ON c.id = p.category_id
      JOIN product_types pt ON pt.id = p.product_type_id
      ${whereSql}
      ORDER BY p.name ASC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return NextResponse.json({
      success: true,
      data: products,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Bạn không có quyền thực hiện thao tác này.' } },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      sku,
      name,
      category_id,
      product_type_id,
      cost_price = 0,
      selling_price = 0,
      initial_stock = 0,
      min_stock_alert = 5,
      effective_date,
    } = body;

    if (!sku || !name || !category_id || !product_type_id) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_INPUT', message: 'Vui lòng nhập đầy đủ SKU, tên, danh mục và loại sản phẩm.' },
        },
        { status: 400 }
      );
    }

    const formattedSku = sku.trim().toUpperCase();

    // Check SKU existence
    const existing = db.prepare('SELECT id FROM products WHERE sku = ?').get(formattedSku);
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: 'DUPLICATE_SKU', message: `Mã sản phẩm / SKU '${formattedSku}' đã tồn tại.` } },
        { status: 400 }
      );
    }

    const today = effective_date || new Date().toISOString().split('T')[0];

    const result = runTransaction((database) => {
      // 1. Insert product
      const info = database.prepare(`
        INSERT INTO products (
          sku, name, category_id, product_type_id,
          current_cost_price, current_selling_price, current_stock,
          min_stock_alert, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
      `).run(
        formattedSku,
        name.trim(),
        category_id,
        product_type_id,
        Number(cost_price) || 0,
        Number(selling_price) || 0,
        Number(initial_stock) || 0,
        Number(min_stock_alert) || 5
      );

      const newProductId = Number(info.lastInsertRowid);

      // 2. Insert initial price history
      database.prepare(`
        INSERT INTO price_history (product_id, price, effective_from, note, created_by)
        VALUES (?, ?, ?, 'Khởi tạo giá niêm yết ban đầu', ?)
      `).run(newProductId, Number(selling_price) || 0, today, user.id);

      // 3. Insert initial cost price history
      database.prepare(`
        INSERT INTO cost_price_history (product_id, cost_price, effective_from, note, created_by)
        VALUES (?, ?, ?, 'Khởi tạo giá vốn ban đầu', ?)
      `).run(newProductId, Number(cost_price) || 0, today, user.id);

      // 4. If initial stock > 0, insert stock movement
      if (Number(initial_stock) > 0) {
        database.prepare(`
          INSERT INTO stock_movements (
            product_id, movement_type, quantity_change, balance_after,
            movement_date, reference_type, note, created_by
          ) VALUES (?, 'PURCHASE', ?, ?, ?, 'INITIAL_STOCK', 'Khởi tạo tồn kho ban đầu', ?)
        `).run(newProductId, Number(initial_stock), Number(initial_stock), today, user.id);
      }

      // 5. Audit log
      database.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_name, entity_id, new_value_json)
        VALUES (?, 'CREATE_PRODUCT', 'PRODUCTS', ?, ?)
      `).run(user.id, newProductId.toString(), JSON.stringify({
        sku: formattedSku,
        name,
        selling_price,
        cost_price,
        initial_stock,
      }));

      return newProductId;
    });

    const newProduct = db.prepare(`
      SELECT 
        p.*,
        c.name as category_name,
        pt.name as product_type_name
      FROM products p
      JOIN categories c ON c.id = p.category_id
      JOIN product_types pt ON pt.id = p.product_type_id
      WHERE p.id = ?
    `).get(result);

    return NextResponse.json({ success: true, data: newProduct }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
