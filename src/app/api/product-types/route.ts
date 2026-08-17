import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');

    let query = `
      SELECT 
        pt.id, pt.category_id, pt.code, pt.name, pt.description, pt.status, pt.created_at, pt.updated_at,
        c.name as category_name,
        COUNT(p.id) as product_count
      FROM product_types pt
      JOIN categories c ON c.id = pt.category_id
      LEFT JOIN products p ON p.product_type_id = pt.id
    `;

    const params: any[] = [];
    if (categoryId) {
      query += ` WHERE pt.category_id = ?`;
      params.push(categoryId);
    }

    query += ` GROUP BY pt.id ORDER BY c.name ASC, pt.name ASC`;

    const productTypes = db.prepare(query).all(...params);

    return NextResponse.json({
      success: true,
      data: productTypes,
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
    const { category_id, code, name, description } = body;

    if (!category_id || !code || !name) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'Vui lòng chọn danh mục, nhập mã và tên loại sản phẩm.' } },
        { status: 400 }
      );
    }

    const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(category_id);
    if (!category) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_CATEGORY', message: 'Danh mục được chọn không tồn tại.' } },
        { status: 400 }
      );
    }

    const formattedCode = code.trim().toUpperCase();
    const existing = db.prepare('SELECT id FROM product_types WHERE code = ?').get(formattedCode);
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: 'DUPLICATE_CODE', message: `Mã loại sản phẩm '${formattedCode}' đã tồn tại.` } },
        { status: 400 }
      );
    }

    const info = db.prepare(`
      INSERT INTO product_types (category_id, code, name, description, status)
      VALUES (?, ?, ?, ?, 'ACTIVE')
    `).run(category_id, formattedCode, name.trim(), description ? description.trim() : null);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_name, entity_id, new_value_json)
      VALUES (?, 'CREATE_PRODUCT_TYPE', 'PRODUCT_TYPES', ?, ?)
    `).run(user.id, info.lastInsertRowid.toString(), JSON.stringify({ category_id, code: formattedCode, name }));

    const newType = db.prepare(`
      SELECT pt.*, c.name as category_name
      FROM product_types pt
      JOIN categories c ON c.id = pt.category_id
      WHERE pt.id = ?
    `).get(info.lastInsertRowid);

    return NextResponse.json({ success: true, data: newType }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
