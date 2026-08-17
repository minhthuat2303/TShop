import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, props: Props) {
  try {
    const { id } = await props.params;
    const type = db.prepare(`
      SELECT pt.*, c.name as category_name
      FROM product_types pt
      JOIN categories c ON c.id = pt.category_id
      WHERE pt.id = ?
    `).get(id);

    if (!type) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy loại sản phẩm.' } },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: type });
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
    const { category_id, name, description, status } = body;

    const oldType = db.prepare('SELECT * FROM product_types WHERE id = ?').get(id) as any;
    if (!oldType) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Không tìm thấy loại sản phẩm.' } },
        { status: 404 }
      );
    }

    db.prepare(`
      UPDATE product_types
      SET category_id = COALESCE(?, category_id),
          name = COALESCE(?, name),
          description = COALESCE(?, description),
          status = COALESCE(?, status),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      category_id,
      name?.trim(),
      description !== undefined ? description?.trim() : oldType.description,
      status,
      id
    );

    const updated = db.prepare(`
      SELECT pt.*, c.name as category_name
      FROM product_types pt
      JOIN categories c ON c.id = pt.category_id
      WHERE pt.id = ?
    `).get(id);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_name, entity_id, old_value_json, new_value_json)
      VALUES (?, 'UPDATE_PRODUCT_TYPE', 'PRODUCT_TYPES', ?, ?, ?)
    `).run(user.id, id, JSON.stringify(oldType), JSON.stringify(updated));

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

    const prodCount = db.prepare('SELECT COUNT(*) as c FROM products WHERE product_type_id = ?').get(id) as any;
    if (prodCount.c > 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INTEGRITY_ERROR',
            message: `Không thể xoá loại sản phẩm này vì còn ${prodCount.c} sản phẩm liên kết.`,
          },
        },
        { status: 400 }
      );
    }

    const old = db.prepare('SELECT * FROM product_types WHERE id = ?').get(id);
    db.prepare('DELETE FROM product_types WHERE id = ?').run(id);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_name, entity_id, old_value_json)
      VALUES (?, 'DELETE_PRODUCT_TYPE', 'PRODUCT_TYPES', ?, ?)
    `).run(user.id, id, JSON.stringify(old));

    return NextResponse.json({ success: true, data: { message: 'Đã xoá loại sản phẩm thành công.' } });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
