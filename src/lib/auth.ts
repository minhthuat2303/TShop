import jwt from 'jsonwebtoken';
import { db } from './db';
import { User, UserSession } from './types';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET || 't_shop_secure_jwt_secret_key_2026_retail';
const COOKIE_NAME = 'tshop_token';

export function signToken(user: { id: number; username: string; full_name: string; role: string }): string {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyToken(token: string): UserSession | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as UserSession;
    return decoded;
  } catch {
    return null;
  }
}

export async function getCurrentUser(request?: NextRequest): Promise<UserSession | null> {
  // 1. Check Authorization header
  if (request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const user = verifyToken(token);
      if (user) return user;
    }
  }

  // 2. Check HTTP-only cookie
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (token) {
      const user = verifyToken(token);
      if (user) return user;
    }
  } catch {
    // Cookie access may fail outside request scope
  }

  return null;
}

export function getUserById(id: number): User | null {
  const user = db.prepare(`
    SELECT id, username, password_hash, full_name, role, status, created_at, updated_at
    FROM users
    WHERE id = ?
  `).get(id) as User | undefined;

  return user || null;
}

export function getUserByUsername(username: string): User | null {
  const user = db.prepare(`
    SELECT id, username, password_hash, full_name, role, status, created_at, updated_at
    FROM users
    WHERE username = ?
  `).get(username) as User | undefined;

  return user || null;
}

export { COOKIE_NAME };
