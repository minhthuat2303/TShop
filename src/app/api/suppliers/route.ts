import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  try {
    const suppliers = await db.query('SELECT * FROM suppliers ORDER BY name ASC');
    return NextResponse.json({ success: true, data: suppliers });
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
    const { code, name, phone, address } = body;

    if (!code || !name) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_INPUT', message: 'Mã và tên nhà cung cấp không được để trống.' } },
        { status: 400 }
      );
    }

    const formattedCode = code.trim().toUpperCase();
    const existing = await db.queryOne('SELECT id FROM suppliers WHERE code = ?', [formattedCode]);
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: 'DUPLICATE_CODE', message: `Mã nhà cung cấp '${formattedCode}' đã tồn tại.` } },
        { status: 400 }
      );
    }

    const info = await db.execute(`
      INSERT INTO suppliers (code, name, phone, address, status)
      VALUES (?, ?, ?, ?, 'ACTIVE')
    `, [formattedCode, name.trim(), phone ? phone.trim() : null, address ? address.trim() : null]);

    const newId = info.lastInsertId;
    const newSupplier = await db.queryOne('SELECT * FROM suppliers WHERE id = ?', [newId]);

    return NextResponse.json({ success: true, data: newSupplier }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
