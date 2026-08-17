import { NextRequest, NextResponse } from 'next/server';
import { db, runTransaction } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, props: Props) {
  try {
    const { id } = await props.params;

    const history = db.prepare(`
      SELECT 
        ph.id, ph.product_id, ph.price, ph.effective_from, ph.note, ph.created_at,
        u.full_name as creator_name
      FROM price_history ph
      LEFT JOIN users u ON u.id = ph.created_by
      WHERE ph.product_id = ?
      ORDER BY ph.effective_from DESC, ph.id DESC
    `).all(id);

    return NextResponse.json({ success: true, data: history });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, props: Props) {
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
    const { price, effective_from, note } = body;

    if (price === undefined || Number(price) < 0 || !effective_from) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_INPUT', message: 'Vui lòng nhập mức giá hợp lệ (>= 0) và ngày bắt đầu áp dụng.' },
        },
        { status: 400 }
      );
    }

    const product = db.prepare('SELECT id, current_selling_price FROM products WHERE id = ?').get(id) as any;
    if (!product) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy sản phẩm.' } },
        { status: 404 }
      );
    }

    const newPrice = Number(price);

    runTransaction((database) => {
      // 1. Insert new price history record (NEVER UPDATE existing historical records)
      database.prepare(`
        INSERT INTO price_history (product_id, price, effective_from, note, created_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, newPrice, effective_from, note ? note.trim() : 'Điều chỉnh giá bán mới', user.id);

      // 2. Update current_selling_price of the product to the latest price
      database.prepare(`
        UPDATE products
        SET current_selling_price = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newPrice, id);

      // 3. Audit log
      database.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_name, entity_id, old_value_json, new_value_json)
        VALUES (?, 'UPDATE_SELLING_PRICE', 'PRODUCTS', ?, ?, ?)
      `).run(
        user.id,
        id,
        JSON.stringify({ price: product.current_selling_price }),
        JSON.stringify({ price: newPrice, effective_from, note })
      );
    });

    const updatedHistory = db.prepare(`
      SELECT 
        ph.id, ph.product_id, ph.price, ph.effective_from, ph.note, ph.created_at,
        u.full_name as creator_name
      FROM price_history ph
      LEFT JOIN users u ON u.id = ph.created_by
      WHERE ph.product_id = ?
      ORDER BY ph.effective_from DESC, ph.id DESC
    `).all(id);

    return NextResponse.json({ success: true, data: updatedHistory }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
