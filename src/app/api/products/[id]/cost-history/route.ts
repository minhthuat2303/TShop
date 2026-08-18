import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, props: Props) {
  try {
    const { id } = await props.params;

    const history = await db.query(`
      SELECT 
        cph.id, cph.product_id, cph.cost_price, cph.effective_from, cph.note, cph.created_at,
        u.full_name as creator_name
      FROM cost_price_history cph
      LEFT JOIN users u ON u.id = cph.created_by
      WHERE cph.product_id = ?
      ORDER BY cph.effective_from DESC, cph.id DESC
    `, [id]);

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
    const { cost_price, effective_from, note } = body;

    if (cost_price === undefined || Number(cost_price) < 0 || !effective_from) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_INPUT', message: 'Vui lòng nhập giá vốn hợp lệ (>= 0) và ngày bắt đầu áp dụng.' },
        },
        { status: 400 }
      );
    }

    const product = await db.queryOne<any>('SELECT id, current_cost_price FROM products WHERE id = ?', [id]);
    if (!product) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy sản phẩm.' } },
        { status: 404 }
      );
    }

    const newCost = Number(cost_price);

    await db.transaction(async (tx) => {
      await tx.execute(`
        INSERT INTO cost_price_history (product_id, cost_price, effective_from, note, created_by)
        VALUES (?, ?, ?, ?, ?)
      `, [id, newCost, effective_from, note ? note.trim() : 'Cập nhật giá vốn', user.id]);

      await tx.execute(`
        UPDATE products
        SET current_cost_price = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [newCost, id]);

      await tx.execute(`
        INSERT INTO audit_logs (user_id, action, entity_name, entity_id, old_value_json, new_value_json)
        VALUES (?, 'UPDATE_COST_PRICE', 'PRODUCTS', ?, ?, ?)
      `, [
        user.id,
        id,
        JSON.stringify({ cost_price: product.current_cost_price }),
        JSON.stringify({ cost_price: newCost, effective_from, note })
      ]);
    });

    const updatedHistory = await db.query(`
      SELECT 
        cph.id, cph.product_id, cph.cost_price, cph.effective_from, cph.note, cph.created_at,
        u.full_name as creator_name
      FROM cost_price_history cph
      LEFT JOIN users u ON u.id = cph.created_by
      WHERE cph.product_id = ?
      ORDER BY cph.effective_from DESC, cph.id DESC
    `, [id]);

    return NextResponse.json({ success: true, data: updatedHistory }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
