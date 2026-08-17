import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, props: Props) {
  try {
    const { id } = await props.params;

    const product = db.prepare(`
      SELECT 
        p.*,
        c.name as category_name,
        pt.name as product_type_name
      FROM products p
      JOIN categories c ON c.id = p.category_id
      JOIN product_types pt ON pt.id = p.product_type_id
      WHERE p.id = ?
    `).get(id);

    if (!product) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy sản phẩm.' } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: product });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, props: Props) {
  try {
    const user = await getCurrentUser(request);
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Bạn không có quyền thực hiện thao tác này.' } },
        { status: 403 }
      );
    }

    const { id } = await props.params;
    const body = await request.json();
    const {
      name,
      category_id,
      product_type_id,
      min_stock_alert,
      status,
    } = body;

    const oldProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as any;
    if (!oldProduct) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy sản phẩm.' } },
        { status: 404 }
      );
    }

    db.prepare(`
      UPDATE products
      SET name = COALESCE(?, name),
          category_id = COALESCE(?, category_id),
          product_type_id = COALESCE(?, product_type_id),
          min_stock_alert = COALESCE(?, min_stock_alert),
          status = COALESCE(?, status),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name?.trim(),
      category_id,
      product_type_id,
      min_stock_alert !== undefined ? Number(min_stock_alert) : oldProduct.min_stock_alert,
      status,
      id
    );

    const updated = db.prepare(`
      SELECT 
        p.*,
        c.name as category_name,
        pt.name as product_type_name
      FROM products p
      JOIN categories c ON c.id = p.category_id
      JOIN product_types pt ON pt.id = p.product_type_id
      WHERE p.id = ?
    `).get(id);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_name, entity_id, old_value_json, new_value_json)
      VALUES (?, 'UPDATE_PRODUCT', 'PRODUCTS', ?, ?, ?)
    `).run(user.id, id, JSON.stringify(oldProduct), JSON.stringify(updated));

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, props: Props) {
  try {
    const user = await getCurrentUser(request);
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Bạn không có quyền thực hiện thao tác này.' } },
        { status: 403 }
      );
    }

    const { id } = await props.params;
    const body = await request.json();
    const { status } = body;

    if (!status || !['ACTIVE', 'INACTIVE'].includes(status)) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_STATUS', message: 'Trạng thái không hợp lệ (ACTIVE hoặc INACTIVE).' } },
        { status: 400 }
      );
    }

    const oldProduct = db.prepare('SELECT id, status FROM products WHERE id = ?').get(id) as any;
    if (!oldProduct) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy sản phẩm.' } },
        { status: 404 }
      );
    }

    db.prepare(`
      UPDATE products
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, id);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_name, entity_id, old_value_json, new_value_json)
      VALUES (?, 'TOGGLE_PRODUCT_STATUS', 'PRODUCTS', ?, ?, ?)
    `).run(user.id, id, JSON.stringify({ status: oldProduct.status }), JSON.stringify({ status }));

    return NextResponse.json({ success: true, data: { id, status } });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, props: Props) {
  try {
    const user = await getCurrentUser(request);
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Bạn không có quyền thực hiện thao tác này.' } },
        { status: 403 }
      );
    }

    const { id } = await props.params;

    // Check if product has sales records
    const salesCount = db.prepare('SELECT COUNT(*) as c FROM sales_records WHERE product_id = ?').get(id) as any;
    if (salesCount.c > 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'TRANSACTION_EXISTS',
            message: `Sản phẩm này đã có ${salesCount.c} giao dịch bán hàng. Không được xóa cứng để bảo vệ dữ liệu lịch sử kế toán. Vui lòng chuyển trạng thái sang 'Ngừng bán'.`,
          },
        },
        { status: 400 }
      );
    }

    // Check if product has stock movements
    const movementsCount = db.prepare('SELECT COUNT(*) as c FROM stock_movements WHERE product_id = ?').get(id) as any;
    if (movementsCount.c > 1) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'STOCK_HISTORY_EXISTS',
            message: `Sản phẩm đã có biến động kho thực tế. Vui lòng chuyển trạng thái sang 'Ngừng bán'.`,
          },
        },
        { status: 400 }
      );
    }

    const old = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!old) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy sản phẩm.' } },
        { status: 404 }
      );
    }

    // Cascade delete price history & clean movement
    db.prepare('DELETE FROM price_history WHERE product_id = ?').run(id);
    db.prepare('DELETE FROM cost_price_history WHERE product_id = ?').run(id);
    db.prepare('DELETE FROM stock_movements WHERE product_id = ?').run(id);
    db.prepare('DELETE FROM products WHERE id = ?').run(id);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_name, entity_id, old_value_json)
      VALUES (?, 'DELETE_PRODUCT', 'PRODUCTS', ?, ?)
    `).run(user.id, id, JSON.stringify(old));

    return NextResponse.json({ success: true, data: { message: 'Đã xóa sản phẩm thành công.' } });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
