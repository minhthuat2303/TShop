import { Pool } from 'pg';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

// Types for unified database operations
export interface DbClient {
  query<T = any>(sqlText: string, params?: any[]): Promise<T[]>;
  queryOne<T = any>(sqlText: string, params?: any[]): Promise<T | null>;
  execute(sqlText: string, params?: any[]): Promise<{ rowCount: number; lastInsertId?: number }>;
}

// Global cache for connection pool in Next.js Serverless warm containers
declare global {
  // eslint-disable-next-line no-var
  var __pg_pool__: Pool | undefined;
  // eslint-disable-next-line no-var
  var __sqlite_db__: Database.Database | undefined;
  // eslint-disable-next-line no-var
  var __db_initialized__: boolean | undefined;
}

// Check if PostgreSQL connection string is configured
export function getPostgresConnectionString(): string | null {
  const url = process.env.POSTGRES_URL || 
              process.env.DATABASE_URL || 
              process.env.POSTGRES_PRISMA_URL || 
              process.env.POSTGRES_URL_NON_POOLING;
  return url && url.trim().length > 0 ? url.trim() : null;
}

export function isUsingPostgres(): boolean {
  return getPostgresConnectionString() !== null;
}

// Helper: Convert SQLite '?' parameter placeholders to PostgreSQL '$1, $2, ...'
export function convertPlaceholdersToPg(sqlText: string): string {
  let paramIndex = 1;
  return sqlText.replace(/\?/g, () => `$${paramIndex++}`);
}

// Helper: Convert PostgreSQL '$1, $2, ...' placeholders to SQLite '?'
export function convertPlaceholdersToSqlite(sqlText: string): string {
  return sqlText.replace(/\$\d+/g, '?');
}

// 1. PostgreSQL Connection Pool Setup
function getPgPool(): Pool {
  if (global.__pg_pool__) {
    return global.__pg_pool__;
  }

  const rawUrl = getPostgresConnectionString()!;
  let cleanUrl = rawUrl.replace(/[?&]sslmode=[^&]*/gi, '').replace(/[?&]supa=[^&]*/gi, '').replace(/[?&]pgbouncer=[^&]*/gi, '');
  if (cleanUrl.endsWith('?')) cleanUrl = cleanUrl.slice(0, -1);

  const isSsl = !cleanUrl.includes('localhost') && !cleanUrl.includes('127.0.0.1');

  const pool = new Pool({
    connectionString: cleanUrl,
    ssl: isSsl ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  if (process.env.NODE_ENV !== 'production') {
    global.__pg_pool__ = pool;
  }

  return pool;
}

// 2. SQLite Fallback Setup (for local dev when no Postgres URL is provided)
function getSqliteDb(): Database.Database {
  if (global.__sqlite_db__) {
    return global.__sqlite_db__;
  }

  const isServerless = process.env.VERCEL === '1' || !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.NOW_REGION;
  let dbPath: string;

  if (isServerless) {
    dbPath = path.join('/tmp', 't_shop.db');
  } else {
    const localDir = path.join(process.cwd(), 'data');
    try {
      if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
      dbPath = path.join(localDir, 't_shop.db');
    } catch {
      dbPath = path.join('/tmp', 't_shop.db');
    }
  }

  const db = new Database(dbPath);
  try { db.pragma('journal_mode = WAL'); } catch { try { db.pragma('journal_mode = DELETE'); } catch {} }
  try { db.pragma('foreign_keys = ON'); db.pragma('busy_timeout = 10000'); } catch {}

  if (process.env.NODE_ENV !== 'production') {
    global.__sqlite_db__ = db;
  }

  return db;
}

// 3. PostgreSQL Schema DDL & Auto-seeding
async function initPgSchema(pool: Pool) {
  if (global.__db_initialized__) return;

  const client = await pool.connect();
  try {
    await client.query(`
      -- 1. USERS
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'STAFF')),
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- 2. CATEGORIES
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- 3. PRODUCT TYPES
      CREATE TABLE IF NOT EXISTS product_types (
        id SERIAL PRIMARY KEY,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- 4. PRODUCTS
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        sku VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
        product_type_id INTEGER NOT NULL REFERENCES product_types(id) ON DELETE RESTRICT,
        current_cost_price NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (current_cost_price >= 0),
        current_selling_price NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (current_selling_price >= 0),
        current_stock INTEGER NOT NULL DEFAULT 0,
        min_stock_alert INTEGER NOT NULL DEFAULT 5,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- 5. PRICE HISTORY
      CREATE TABLE IF NOT EXISTS price_history (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        price NUMERIC(15, 2) NOT NULL CHECK (price >= 0),
        effective_from DATE NOT NULL,
        note TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- 6. COST PRICE HISTORY
      CREATE TABLE IF NOT EXISTS cost_price_history (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        cost_price NUMERIC(15, 2) NOT NULL CHECK (cost_price >= 0),
        effective_from DATE NOT NULL,
        note TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- 7. SALES RECORDS
      CREATE TABLE IF NOT EXISTS sales_records (
        id SERIAL PRIMARY KEY,
        transaction_code VARCHAR(100) UNIQUE NOT NULL,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        sale_date DATE NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_price_at_sale NUMERIC(15, 2) NOT NULL CHECK (unit_price_at_sale >= 0),
        cost_price_at_sale NUMERIC(15, 2) NOT NULL CHECK (cost_price_at_sale >= 0),
        discount NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
        total_revenue NUMERIC(15, 2) NOT NULL CHECK (total_revenue >= 0),
        total_cost NUMERIC(15, 2) NOT NULL CHECK (total_cost >= 0),
        profit NUMERIC(15, 2) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'CANCELLED')),
        cancel_reason TEXT,
        cancelled_at TIMESTAMPTZ,
        cancelled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        note TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- 8. STOCK MOVEMENTS
      CREATE TABLE IF NOT EXISTS stock_movements (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        movement_type VARCHAR(30) NOT NULL CHECK (movement_type IN ('SALE', 'PURCHASE', 'DAMAGE', 'LOSS', 'GIFT', 'RETURN', 'ADJUSTMENT')),
        quantity_change INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        movement_date DATE NOT NULL,
        reference_type VARCHAR(50),
        reference_id INTEGER,
        note TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- 9. SUPPLIERS
      CREATE TABLE IF NOT EXISTS suppliers (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        address TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- 10. IMPORTS
      CREATE TABLE IF NOT EXISTS imports (
        id SERIAL PRIMARY KEY,
        import_code VARCHAR(100) UNIQUE NOT NULL,
        supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
        import_date DATE NOT NULL,
        total_amount NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
        note TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- 11. IMPORT ITEMS
      CREATE TABLE IF NOT EXISTS import_items (
        id SERIAL PRIMARY KEY,
        import_id INTEGER NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_cost_price NUMERIC(15, 2) NOT NULL CHECK (unit_cost_price >= 0),
        total_amount NUMERIC(15, 2) NOT NULL CHECK (total_amount >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- 12. IMPORT LOGS
      CREATE TABLE IF NOT EXISTS import_logs (
        id SERIAL PRIMARY KEY,
        file_name VARCHAR(255) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        total_rows INTEGER NOT NULL DEFAULT 0,
        valid_rows INTEGER NOT NULL DEFAULT 0,
        error_rows INTEGER NOT NULL DEFAULT 0,
        created_rows INTEGER NOT NULL DEFAULT 0,
        updated_rows INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(50) NOT NULL,
        details_json TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- 13. AUDIT LOGS
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        entity_name VARCHAR(100) NOT NULL,
        entity_id VARCHAR(100),
        old_value_json TEXT,
        new_value_json TEXT,
        ip_address VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- 14. INVENTORY LOTS (FIFO)
      CREATE TABLE IF NOT EXISTS inventory_lots (
        id SERIAL PRIMARY KEY,
        lot_code VARCHAR(100) UNIQUE NOT NULL,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        purchase_date DATE NOT NULL,
        quantity_received INTEGER NOT NULL CHECK (quantity_received > 0),
        quantity_remaining INTEGER NOT NULL CHECK (quantity_remaining >= 0),
        unit_cost NUMERIC(15, 2) NOT NULL CHECK (unit_cost >= 0),
        supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
        import_id INTEGER REFERENCES imports(id) ON DELETE SET NULL,
        note TEXT,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- 15. SALE COST ALLOCATIONS
      CREATE TABLE IF NOT EXISTS sale_cost_allocations (
        id SERIAL PRIMARY KEY,
        sale_id INTEGER NOT NULL REFERENCES sales_records(id) ON DELETE CASCADE,
        inventory_lot_id INTEGER NOT NULL REFERENCES inventory_lots(id) ON DELETE RESTRICT,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_cost NUMERIC(15, 2) NOT NULL CHECK (unit_cost >= 0),
        total_cost NUMERIC(15, 2) NOT NULL CHECK (total_cost >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- INDEXES
      CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
      CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
      CREATE INDEX IF NOT EXISTS idx_products_cat_type ON products(category_id, product_type_id);
      CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
      CREATE INDEX IF NOT EXISTS idx_price_history_lookup ON price_history(product_id, effective_from DESC);
      CREATE INDEX IF NOT EXISTS idx_cost_price_history_lookup ON cost_price_history(product_id, effective_from DESC);
      CREATE INDEX IF NOT EXISTS idx_sales_records_date ON sales_records(sale_date);
      CREATE INDEX IF NOT EXISTS idx_sales_records_product_date ON sales_records(product_id, sale_date);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_prod_date ON stock_movements(product_id, movement_date);
      CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);
      CREATE INDEX IF NOT EXISTS idx_inventory_lots_fifo ON inventory_lots(product_id, purchase_date ASC, id ASC);
      CREATE INDEX IF NOT EXISTS idx_inventory_lots_code ON inventory_lots(lot_code);
      CREATE INDEX IF NOT EXISTS idx_sale_alloc_sale ON sale_cost_allocations(sale_id);
      CREATE INDEX IF NOT EXISTS idx_sale_alloc_lot ON sale_cost_allocations(inventory_lot_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_date ON audit_logs(user_id, created_at DESC);
    `);

    // Auto-seed Default Users (Admin / Staff)
    const userRes = await client.query('SELECT COUNT(*) as count FROM users');
    if (parseInt(userRes.rows[0].count, 10) === 0) {
      const adminHash = bcrypt.hashSync('admin123', 10);
      const staffHash = bcrypt.hashSync('staff123', 10);
      await client.query(`
        INSERT INTO users (username, password_hash, full_name, role, status)
        VALUES 
          ('admin', $1, 'Quản Trị Viên (Admin)', 'ADMIN', 'ACTIVE'),
          ('staff', $2, 'Nhân Viên Bán Hàng', 'STAFF', 'ACTIVE')
        ON CONFLICT (username) DO NOTHING
      `, [adminHash, staffHash]);
    }

    // Auto-seed Default Categories, Types & Sample Products
    const catRes = await client.query('SELECT COUNT(*) as count FROM categories');
    if (parseInt(catRes.rows[0].count, 10) === 0) {
      await client.query(`
        INSERT INTO categories (code, name, description, status) VALUES
          ('GB', 'Gấu bông', 'Các loại thú nhồi bông mềm cao cấp', 'ACTIVE'),
          ('XE', 'Xe đồ chơi', 'Xe điều khiển từ xa, xe mô hình kim loại', 'ACTIVE'),
          ('LEGO', 'Lego & Xếp hình', 'Đồ chơi lắp ghép phát triển trí tuệ', 'ACTIVE'),
          ('BB', 'Búp bê & Phụ kiện', 'Búp bê thời trang, nhà búp bê', 'ACTIVE'),
          ('GD', 'Đồ chơi giáo dục', 'Đồ chơi montessori, bảng chữ cái, đồ chơi gỗ', 'ACTIVE')
        ON CONFLICT (code) DO NOTHING;
      `);

      await client.query(`
        INSERT INTO product_types (category_id, code, name, description, status)
        SELECT id, 'CAPYBARA', 'Gấu Capybara', 'Capybara đeo balo, mũ rùa', 'ACTIVE' FROM categories WHERE code = 'GB';
        INSERT INTO product_types (category_id, code, name, description, status)
        SELECT id, 'TEDDY', 'Gấu Teddy', 'Gấu teddy lông xù cao cấp', 'ACTIVE' FROM categories WHERE code = 'GB';
        INSERT INTO product_types (category_id, code, name, description, status)
        SELECT id, 'RC_CAR', 'Xe điều khiển RC', 'Xe địa hình điều khiển tốc độ cao', 'ACTIVE' FROM categories WHERE code = 'XE';
        INSERT INTO product_types (category_id, code, name, description, status)
        SELECT id, 'DIECAST', 'Xe mô hình kim loại', 'Mô hình tỉ lệ 1:24, 1:32', 'ACTIVE' FROM categories WHERE code = 'XE';
        INSERT INTO product_types (category_id, code, name, description, status)
        SELECT id, 'LEGO_CITY', 'Lego City', 'Chủ đề thành phố, cứu hoả, cảnh sát', 'ACTIVE' FROM categories WHERE code = 'LEGO';
      `);

      await client.query(`
        INSERT INTO products (sku, name, category_id, product_type_id, current_cost_price, current_selling_price, current_stock, min_stock_alert, status)
        SELECT 'GB-CAPY-01', 'Gấu bông Capybara đeo balo rùa xanh 30cm', c.id, pt.id, 65000, 145000, 48, 5, 'ACTIVE'
        FROM categories c JOIN product_types pt ON pt.category_id = c.id WHERE c.code = 'GB' AND pt.code = 'CAPYBARA';

        INSERT INTO products (sku, name, category_id, product_type_id, current_cost_price, current_selling_price, current_stock, min_stock_alert, status)
        SELECT 'GB-TEDDY-01', 'Gấu Teddy xù áo len đỏ 45cm', c.id, pt.id, 120000, 260000, 25, 5, 'ACTIVE'
        FROM categories c JOIN product_types pt ON pt.category_id = c.id WHERE c.code = 'GB' AND pt.code = 'TEDDY';

        INSERT INTO products (sku, name, category_id, product_type_id, current_cost_price, current_selling_price, current_stock, min_stock_alert, status)
        SELECT 'XE-RC-01', 'Xe đua điều khiển từ xa Rock Crawler 4WD', c.id, pt.id, 185000, 390000, 16, 3, 'ACTIVE'
        FROM categories c JOIN product_types pt ON pt.category_id = c.id WHERE c.code = 'XE' AND pt.code = 'RC_CAR';

        INSERT INTO products (sku, name, category_id, product_type_id, current_cost_price, current_selling_price, current_stock, min_stock_alert, status)
        SELECT 'XE-DIE-01', 'Mô hình siêu xe Lamborghini Aventador 1:24 kim loại', c.id, pt.id, 110000, 240000, 30, 5, 'ACTIVE'
        FROM categories c JOIN product_types pt ON pt.category_id = c.id WHERE c.code = 'XE' AND pt.code = 'DIECAST';

        INSERT INTO products (sku, name, category_id, product_type_id, current_cost_price, current_selling_price, current_stock, min_stock_alert, status)
        SELECT 'LEGO-CITY-01', 'Bộ xếp hình Trạm cứu hoả thành phố 500 chi tiết', c.id, pt.id, 210000, 450000, 12, 3, 'ACTIVE'
        FROM categories c JOIN product_types pt ON pt.category_id = c.id WHERE c.code = 'LEGO' AND pt.code = 'LEGO_CITY';
      `);

      // Baseline initial lots for seeded products
      await client.query(`
        INSERT INTO inventory_lots (lot_code, product_id, purchase_date, quantity_received, quantity_remaining, unit_cost, note)
        SELECT 'LOT-INIT-' || sku || '-001', id, CURRENT_DATE, current_stock, current_stock, current_cost_price, 'Khởi tạo lô tồn kho ban đầu'
        FROM products;
      `);
    }

    global.__db_initialized__ = true;
  } finally {
    client.release();
  }
}

// SQLite schema initialization helper
function initSqliteSchema(db: Database.Database) {
  if (global.__db_initialized__) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('ADMIN', 'STAFF')),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL COLLATE NOCASE,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS product_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      code TEXT UNIQUE NOT NULL COLLATE NOCASE,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT UNIQUE NOT NULL COLLATE NOCASE,
      name TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      product_type_id INTEGER NOT NULL REFERENCES product_types(id) ON DELETE RESTRICT,
      current_cost_price REAL NOT NULL DEFAULT 0 CHECK (current_cost_price >= 0),
      current_selling_price REAL NOT NULL DEFAULT 0 CHECK (current_selling_price >= 0),
      current_stock INTEGER NOT NULL DEFAULT 0,
      min_stock_alert INTEGER NOT NULL DEFAULT 5,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      price REAL NOT NULL CHECK (price >= 0),
      effective_from DATE NOT NULL,
      note TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cost_price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      cost_price REAL NOT NULL CHECK (cost_price >= 0),
      effective_from DATE NOT NULL,
      note TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_code TEXT UNIQUE NOT NULL,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      sale_date DATE NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price_at_sale REAL NOT NULL CHECK (unit_price_at_sale >= 0),
      cost_price_at_sale REAL NOT NULL CHECK (cost_price_at_sale >= 0),
      discount REAL NOT NULL DEFAULT 0 CHECK (discount >= 0),
      total_revenue REAL NOT NULL CHECK (total_revenue >= 0),
      total_cost REAL NOT NULL CHECK (total_cost >= 0),
      profit REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'CANCELLED')),
      cancel_reason TEXT,
      cancelled_at DATETIME,
      cancelled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      note TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      movement_type TEXT NOT NULL CHECK (movement_type IN ('SALE', 'PURCHASE', 'DAMAGE', 'LOSS', 'GIFT', 'RETURN', 'ADJUSTMENT')),
      quantity_change INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      movement_date DATE NOT NULL,
      reference_type TEXT,
      reference_id INTEGER,
      note TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL COLLATE NOCASE,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_code TEXT UNIQUE NOT NULL,
      supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      import_date DATE NOT NULL,
      total_amount REAL NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
      note TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS import_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_id INTEGER NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_cost_price REAL NOT NULL CHECK (unit_cost_price >= 0),
      total_amount REAL NOT NULL CHECK (total_amount >= 0),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS import_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      total_rows INTEGER NOT NULL DEFAULT 0,
      valid_rows INTEGER NOT NULL DEFAULT 0,
      error_rows INTEGER NOT NULL DEFAULT 0,
      created_rows INTEGER NOT NULL DEFAULT 0,
      updated_rows INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      details_json TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_name TEXT NOT NULL,
      entity_id TEXT,
      old_value_json TEXT,
      new_value_json TEXT,
      ip_address TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS inventory_lots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lot_code TEXT UNIQUE NOT NULL,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      purchase_date DATE NOT NULL,
      quantity_received INTEGER NOT NULL CHECK (quantity_received > 0),
      quantity_remaining INTEGER NOT NULL CHECK (quantity_remaining >= 0),
      unit_cost REAL NOT NULL CHECK (unit_cost >= 0),
      supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      import_id INTEGER REFERENCES imports(id) ON DELETE SET NULL,
      note TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sale_cost_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales_records(id) ON DELETE CASCADE,
      inventory_lot_id INTEGER NOT NULL REFERENCES inventory_lots(id) ON DELETE RESTRICT,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_cost REAL NOT NULL CHECK (unit_cost >= 0),
      total_cost REAL NOT NULL CHECK (total_cost >= 0),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_products_cat_type ON products(category_id, product_type_id);
    CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
    CREATE INDEX IF NOT EXISTS idx_price_history_lookup ON price_history(product_id, effective_from DESC);
    CREATE INDEX IF NOT EXISTS idx_cost_price_history_lookup ON cost_price_history(product_id, effective_from DESC);
    CREATE INDEX IF NOT EXISTS idx_sales_records_date ON sales_records(sale_date);
    CREATE INDEX IF NOT EXISTS idx_sales_records_product_date ON sales_records(product_id, sale_date);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_prod_date ON stock_movements(product_id, movement_date);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type);
    CREATE INDEX IF NOT EXISTS idx_inventory_lots_fifo ON inventory_lots(product_id, purchase_date ASC, id ASC);
    CREATE INDEX IF NOT EXISTS idx_inventory_lots_code ON inventory_lots(lot_code);
    CREATE INDEX IF NOT EXISTS idx_sale_alloc_sale ON sale_cost_allocations(sale_id);
    CREATE INDEX IF NOT EXISTS idx_sale_alloc_lot ON sale_cost_allocations(inventory_lot_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_date ON audit_logs(user_id, created_at DESC);
  `);

  // Auto-seed admin and staff
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any)?.count || 0;
  if (userCount === 0) {
    const adminHash = bcrypt.hashSync('admin123', 10);
    const staffHash = bcrypt.hashSync('staff123', 10);
    db.prepare(`
      INSERT OR IGNORE INTO users (username, password_hash, full_name, role, status)
      VALUES (?, ?, ?, ?, 'ACTIVE')
    `).run('admin', adminHash, 'Quản Trị Viên (Admin)', 'ADMIN');
    db.prepare(`
      INSERT OR IGNORE INTO users (username, password_hash, full_name, role, status)
      VALUES (?, ?, ?, ?, 'ACTIVE')
    `).run('staff', staffHash, 'Nhân Viên Bán Hàng', 'STAFF');
  }

  global.__db_initialized__ = true;
}

// 4. Unified Query Layer
export async function query<T = any>(sqlText: string, params: any[] = []): Promise<T[]> {
  if (isUsingPostgres()) {
    const pool = getPgPool();
    await initPgSchema(pool);
    const pgSql = convertPlaceholdersToPg(sqlText);
    const res = await pool.query(pgSql, params);
    return res.rows as T[];
  } else {
    const sqlite = getSqliteDb();
    initSqliteSchema(sqlite);
    const sqliteSql = convertPlaceholdersToSqlite(sqlText);
    return sqlite.prepare(sqliteSql).all(...params) as T[];
  }
}

export async function queryOne<T = any>(sqlText: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sqlText, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function execute(sqlText: string, params: any[] = []): Promise<{ rowCount: number; lastInsertId?: number }> {
  if (isUsingPostgres()) {
    const pool = getPgPool();
    await initPgSchema(pool);
    let pgSql = convertPlaceholdersToPg(sqlText);
    
    // If insert statement doesn't have RETURNING and is an INSERT, we can append RETURNING id
    const isInsert = /^\s*INSERT\s+INTO/i.test(pgSql);
    const hasReturning = /RETURNING/i.test(pgSql);
    
    if (isInsert && !hasReturning) {
      pgSql += ' RETURNING id';
    }

    const res = await pool.query(pgSql, params);
    const lastInsertId = res.rows.length > 0 && res.rows[0].id ? Number(res.rows[0].id) : undefined;
    return { rowCount: res.rowCount || 0, lastInsertId };
  } else {
    const sqlite = getSqliteDb();
    initSqliteSchema(sqlite);
    const sqliteSql = convertPlaceholdersToSqlite(sqlText);
    const info = sqlite.prepare(sqliteSql).run(...params);
    return { rowCount: info.changes, lastInsertId: Number(info.lastInsertRowid) };
  }
}

export async function transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
  if (isUsingPostgres()) {
    const pool = getPgPool();
    await initPgSchema(pool);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const txClient: DbClient = {
        async query<R = any>(sqlText: string, params: any[] = []): Promise<R[]> {
          const pgSql = convertPlaceholdersToPg(sqlText);
          const res = await client.query(pgSql, params);
          return res.rows as R[];
        },
        async queryOne<R = any>(sqlText: string, params: any[] = []): Promise<R | null> {
          const rows = await this.query<R>(sqlText, params);
          return rows.length > 0 ? rows[0] : null;
        },
        async execute(sqlText: string, params: any[] = []): Promise<{ rowCount: number; lastInsertId?: number }> {
          let pgSql = convertPlaceholdersToPg(sqlText);
          const isInsert = /^\s*INSERT\s+INTO/i.test(pgSql);
          const hasReturning = /RETURNING/i.test(pgSql);
          if (isInsert && !hasReturning) {
            pgSql += ' RETURNING id';
          }
          const res = await client.query(pgSql, params);
          const lastInsertId = res.rows.length > 0 && res.rows[0].id ? Number(res.rows[0].id) : undefined;
          return { rowCount: res.rowCount || 0, lastInsertId };
        },
      };

      const result = await fn(txClient);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } else {
    const sqlite = getSqliteDb();
    initSqliteSchema(sqlite);

    const txClient: DbClient = {
      async query<R = any>(sqlText: string, params: any[] = []): Promise<R[]> {
        const sqliteSql = convertPlaceholdersToSqlite(sqlText);
        return sqlite.prepare(sqliteSql).all(...params) as R[];
      },
      async queryOne<R = any>(sqlText: string, params: any[] = []): Promise<R | null> {
        const rows = await this.query<R>(sqlText, params);
        return rows.length > 0 ? rows[0] : null;
      },
      async execute(sqlText: string, params: any[] = []): Promise<{ rowCount: number; lastInsertId?: number }> {
        const sqliteSql = convertPlaceholdersToSqlite(sqlText);
        const info = sqlite.prepare(sqliteSql).run(...params);
        return { rowCount: info.changes, lastInsertId: Number(info.lastInsertRowid) };
      },
    };

    let result: T;
    const runInTransaction = sqlite.transaction(() => {
      // synchronous execution wrapper
    });
    // For async support in SQLite fallback
    return await fn(txClient);
  }
}

// 5. Default db export object for easy consumption
export const db = {
  query,
  queryOne,
  execute,
  transaction,
};

export default db;
