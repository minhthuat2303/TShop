import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import serverCache from '@/lib/cache';

// GET all categories with product and type counts (Cached)
export async function GET() {
  try {
    const cacheKey = 'categories:all';
    const cached = serverCache.get(cacheKey);
    if (cached) {
      return NextResponse.json({ success: true, data: cached }, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' }
      });
    }

    const categories = await db.query(`
      SELECT 
        c.id, c.code, c.name, c.description, c.status, c.created_at, c.updated_at,
        COUNT(DISTINCT pt.id) as type_count,
        COUNT(DISTINCT p.id) as product_count
      FROM categories c
      LEFT JOIN product_types pt ON pt.category_id = c.id
      LEFT JOIN products p ON p.category_id = c.id
      GROUP BY c.id, c.code, c.name, c.description, c.status, c.created_at, c.updated_at
      ORDER BY c.name ASC
    `);

    serverCache.set(cacheKey, categories, 180, ['categories']);

    return NextResponse.json({
      success: true,
      data: categories,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' }
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'DB_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}

// POST create a category (ADMIN only)
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
    const { code, name, description } = body;

    if (!code || !name) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'Mã và tên danh mục không được để trống.' } },
        { status: 400 }
      );
    }

    const formattedCode = code.trim().toUpperCase();
    const existing = await db.queryOne('SELECT id FROM categories WHERE code = ?', [formattedCode]);
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: 'DUPLICATE_CODE', message: `Mã danh mục '${formattedCode}' đã tồn tại.` } },
        { status: 400 }
      );
    }

    const info = await db.execute(`
      INSERT INTO categories (code, name, description, status)
      VALUES (?, ?, ?, 'ACTIVE')
    `, [formattedCode, name.trim(), description ? description.trim() : null]);

    const newId = info.lastInsertId;

    serverCache.invalidateTags(['categories']);

    await db.execute(`
      INSERT INTO audit_logs (user_id, action, entity_name, entity_id, new_value_json)
      VALUES (?, 'CREATE_CATEGORY', 'CATEGORIES', ?, ?)
    `, [user.id, (newId || 0).toString(), JSON.stringify({ code: formattedCode, name })]);

    const newCategory = await db.queryOne('SELECT * FROM categories WHERE id = ?', [newId]);

    return NextResponse.json({
      success: true,
      data: newCategory,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
