import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  try {
    const suppliers = db.prepare('SELECT * FROM suppliers ORDER BY name ASC').all();
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
    const existing = db.prepare('SELECT id FROM suppliers WHERE code = ?').get(formattedCode);
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: 'DUPLICATE_CODE', message: `Mã nhà cung cấp '${formattedCode}' đã tồn tại.` } },
        { status: 400 }
      );
    }

    const info = db.prepare(`
      INSERT INTO suppliers (code, name, phone, address, status)
      VALUES (?, ?, ?, ?, 'ACTIVE')
    `).run(formattedCode, name.trim(), phone ? phone.trim() : null, address ? address.trim() : null);

    const newSupplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(info.lastInsertRowid);

    return NextResponse.json({ success: true, data: newSupplier }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
