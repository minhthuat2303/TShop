import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 't_shop.db');

// Global cache for Next.js hot reload support
declare global {
  // eslint-disable-next-line no-var
  var __tshop_db__: Database.Database | undefined;
}

function getDatabase(): Database.Database {
  if (global.__tshop_db__) {
    return global.__tshop_db__;
  }

  const db = new Database(DB_PATH, {
    // verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
  });

  // Enable WAL mode & foreign keys for high-performance concurrent writes & ACID safety
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 10000');
  db.pragma('synchronous = NORMAL');

  initSchema(db);

  if (process.env.NODE_ENV !== 'production') {
    global.__tshop_db__ = db;
  }

  return db;
}

export function initSchema(db: Database.Database) {
  db.exec(`
    -- 1. USERS TABLE
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

    -- 2. CATEGORIES TABLE
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL COLLATE NOCASE,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. PRODUCT TYPES TABLE
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

    -- 4. PRODUCTS TABLE
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

    -- 5. PRICE HISTORY TABLE (APPEND-ONLY)
    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      price REAL NOT NULL CHECK (price >= 0),
      effective_from DATE NOT NULL,
      note TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 6. COST PRICE HISTORY TABLE (APPEND-ONLY)
    CREATE TABLE IF NOT EXISTS cost_price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      cost_price REAL NOT NULL CHECK (cost_price >= 0),
      effective_from DATE NOT NULL,
      note TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 7. SALES RECORDS (TRANSACTION SNAPSHOTS)
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

    -- 8. STOCK MOVEMENTS TABLE (LEDGER / APPEND-ONLY)
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

    -- 9. SUPPLIERS TABLE
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

    -- 10. IMPORTS TABLE
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

    -- 11. IMPORT ITEMS TABLE
    CREATE TABLE IF NOT EXISTS import_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_id INTEGER NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_cost_price REAL NOT NULL CHECK (unit_cost_price >= 0),
      total_amount REAL NOT NULL CHECK (total_amount >= 0),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- 12. IMPORT LOGS TABLE (FOR EXCEL PROCESSING)
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

    -- 13. AUDIT LOGS TABLE
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

    -- 14. INVENTORY LOTS TABLE (PURCHASE LOTS WITH REMAINING QUANTITY FOR FIFO)
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

    -- 15. SALE COST ALLOCATIONS (FIFO BREAKDOWN PER SALE)
    CREATE TABLE IF NOT EXISTS sale_cost_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales_records(id) ON DELETE CASCADE,
      inventory_lot_id INTEGER NOT NULL REFERENCES inventory_lots(id) ON DELETE RESTRICT,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_cost REAL NOT NULL CHECK (unit_cost >= 0),
      total_cost REAL NOT NULL CHECK (total_cost >= 0),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- INDEXES FOR FAST RETRIEVAL
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

  // Safe migration for sales_records status and cancellation columns
  try {
    db.exec(`ALTER TABLE sales_records ADD COLUMN status TEXT NOT NULL DEFAULT 'COMPLETED';`);
  } catch {}
  try {
    db.exec(`ALTER TABLE sales_records ADD COLUMN cancel_reason TEXT;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE sales_records ADD COLUMN cancelled_at DATETIME;`);
  } catch {}
  try {
    db.exec(`ALTER TABLE sales_records ADD COLUMN cancelled_by INTEGER;`);
  } catch {}

  // Safe baseline migration for existing products with stock > 0 but no lots yet
  try {
    const prodsWithoutLots = db.prepare(`
      SELECT p.id, p.sku, p.current_stock, p.current_cost_price, p.created_at
      FROM products p
      WHERE p.current_stock > 0
        AND NOT EXISTS (SELECT 1 FROM inventory_lots il WHERE il.product_id = p.id)
    `).all() as any[];

    if (prodsWithoutLots.length > 0) {
      const insertLot = db.prepare(`
        INSERT INTO inventory_lots (lot_code, product_id, purchase_date, quantity_received, quantity_remaining, unit_cost, note)
        VALUES (?, ?, ?, ?, ?, ?, 'Khởi tạo lô tồn kho ban đầu')
      `);

      db.transaction(() => {
        for (const p of prodsWithoutLots) {
          const lotCode = `LOT-INIT-${p.sku}-${Date.now().toString().slice(-4)}`;
          const pDate = p.created_at ? p.created_at.split(' ')[0] : '2026-08-01';
          insertLot.run(lotCode, p.id, pDate, p.current_stock, p.current_stock, p.current_cost_price);
        }
      })();
    }
  } catch (e) {
    console.error('Initial lot migration notice:', e);
  }
}

export const db = getDatabase();

export function runTransaction<T>(fn: (db: Database.Database) => T): T {
  const transaction = db.transaction(() => {
    return fn(db);
  });
  return transaction();
}
