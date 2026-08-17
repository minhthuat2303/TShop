import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getUserByUsername, signToken, COOKIE_NAME } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_INPUT', message: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.' },
        },
        { status: 400 }
      );
    }

    const user = getUserByUsername(username);

    if (!user || user.status !== 'ACTIVE') {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'AUTH_FAILED', message: 'Tên đăng nhập hoặc mật khẩu không chính xác.' },
        },
        { status: 401 }
      );
    }

    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'AUTH_FAILED', message: 'Tên đăng nhập hoặc mật khẩu không chính xác.' },
        },
        { status: 401 }
      );
    }

    const token = signToken({
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
    });

    // Log audit login
    try {
      db.prepare(`
        INSERT INTO audit_logs (user_id, action, entity_name, entity_id, new_value_json)
        VALUES (?, 'USER_LOGIN', 'USERS', ?, ?)
      `).run(user.id, user.id.toString(), JSON.stringify({ username: user.username, role: user.role }));
    } catch (e) {
      console.error('Failed to write audit log:', e);
    }

    const response = NextResponse.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          full_name: user.full_name,
          role: user.role,
        },
      },
    });

    response.cookies.set({
      name: COOKIE_NAME,
      value: token,
      httpOnly: true,
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      sameSite: 'lax',
    });

    return response;
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'SERVER_ERROR', message: error.message || 'Lỗi xử lý đăng nhập' },
      },
      { status: 500 }
    );
  }
}
