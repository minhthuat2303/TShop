import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, props: Props) {
  try {
    const { id } = await props.params;
    const category = await db.queryOne('SELECT * FROM categories WHERE id = ?', [id]);

    if (!category) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy danh mục.' } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: category });
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
    const { name, description, status } = body;

    const oldCat = await db.queryOne<any>('SELECT * FROM categories WHERE id = ?', [id]);
    if (!oldCat) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy danh mục.' } },
        { status: 404 }
      );
    }

    await db.execute(`
      UPDATE categories
      SET name = COALESCE(?, name),
          description = COALESCE(?, description),
          status = COALESCE(?, status),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [name?.trim(), description !== undefined ? description?.trim() : oldCat.description, status, id]);

    const updated = await db.queryOne('SELECT * FROM categories WHERE id = ?', [id]);

    await db.execute(`
      INSERT INTO audit_logs (user_id, action, entity_name, entity_id, old_value_json, new_value_json)
      VALUES (?, 'UPDATE_CATEGORY', 'CATEGORIES', ?, ?, ?)
    `, [user.id, id, JSON.stringify(oldCat), JSON.stringify(updated)]);

    return NextResponse.json({ success: true, data: updated });
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

    // Check if category has associated products
    const prodCount = await db.queryOne<any>('SELECT COUNT(*) as c FROM products WHERE category_id = ?', [id]);
    if (prodCount && Number(prodCount.c) > 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INTEGRITY_ERROR',
            message: `Không thể xoá danh mục này vì còn ${prodCount.c} sản phẩm liên kết. Vui lòng chuyển trạng thái sang Ngừng hoạt động hoặc chuyển sản phẩm sang danh mục khác.`,
          },
        },
        { status: 400 }
      );
    }

    // Check if category has associated product types
    const typeCount = await db.queryOne<any>('SELECT COUNT(*) as c FROM product_types WHERE category_id = ?', [id]);
    if (typeCount && Number(typeCount.c) > 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INTEGRITY_ERROR',
            message: `Không thể xoá danh mục này vì còn ${typeCount.c} loại sản phẩm liên kết.`,
          },
        },
        { status: 400 }
      );
    }

    const old = await db.queryOne('SELECT * FROM categories WHERE id = ?', [id]);
    await db.execute('DELETE FROM categories WHERE id = ?', [id]);

    await db.execute(`
      INSERT INTO audit_logs (user_id, action, entity_name, entity_id, old_value_json)
      VALUES (?, 'DELETE_CATEGORY', 'CATEGORIES', ?, ?)
    `, [user.id, id, JSON.stringify(old)]);

    return NextResponse.json({ success: true, data: { message: 'Đã xoá danh mục thành công.' } });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
