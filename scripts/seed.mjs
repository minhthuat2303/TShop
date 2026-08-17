import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 't_shop.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 10000');

console.log('--- INITIALIZING SCHEMA & SEEDING T_SHOP DATABASE ---');

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
    total_revenue REAL NOT NULL CHECK (total_revenue >= 0),
    total_cost REAL NOT NULL CHECK (total_cost >= 0),
    profit REAL NOT NULL,
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

  CREATE INDEX IF NOT EXISTS idx_audit_logs_user_date ON audit_logs(user_id, created_at DESC);
`);

const seedTx = db.transaction(() => {
  // 1. Users
  const adminHash = bcrypt.hashSync('admin123', 10);
  const staffHash = bcrypt.hashSync('staff123', 10);

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (username, password_hash, full_name, role, status)
    VALUES (?, ?, ?, ?, 'ACTIVE')
  `);

  insertUser.run('admin', adminHash, 'Quản Trị Viên (Admin)', 'ADMIN');
  insertUser.run('staff', staffHash, 'Nhân Viên Bán Hàng', 'STAFF');

  const adminUser = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  const adminId = adminUser ? adminUser.id : 1;

  // 2. Categories
  const categories = [
    { code: 'GB', name: 'Gấu bông', description: 'Các loại thú nhồi bông mềm cao cấp' },
    { code: 'XE', name: 'Xe đồ chơi', description: 'Xe điều khiển từ xa, xe mô hình kim loại' },
    { code: 'LEGO', name: 'Lego & Xếp hình', description: 'Đồ chơi lắp ghép phát triển trí tuệ' },
    { code: 'BB', name: 'Búp bê & Phụ kiện', description: 'Búp bê thời trang, nhà búp bê' },
    { code: 'GD', name: 'Đồ chơi giáo dục', description: 'Đồ chơi montessori, bảng chữ cái, đồ chơi gỗ' },
  ];

  const insertCat = db.prepare(`
    INSERT OR IGNORE INTO categories (code, name, description, status)
    VALUES (?, ?, ?, 'ACTIVE')
  `);

  for (const c of categories) {
    insertCat.run(c.code, c.name, c.description);
  }

  // 3. Product Types
  const getCatId = (code) => db.prepare('SELECT id FROM categories WHERE code = ?').get(code).id;

  const productTypes = [
    { category_code: 'GB', code: 'CAPYBARA', name: 'Gấu Capybara', description: 'Capybara đeo balo, mũ rùa' },
    { category_code: 'GB', code: 'TEDDY', name: 'Gấu Teddy', description: 'Gấu teddy lông xù cao cấp' },
    { category_code: 'XE', code: 'RC_CAR', name: 'Xe điều khiển RC', description: 'Xe địa hình điều khiển tốc độ cao' },
    { category_code: 'XE', code: 'DIECAST', name: 'Xe mô hình kim loại', description: 'Mô hình tỉ lệ 1:24, 1:32' },
    { category_code: 'LEGO', code: 'LEGO_CITY', name: 'Lego City', description: 'Chủ đề thành phố, cứu hoả, cảnh sát' },
    { category_code: 'LEGO', code: 'LEGO_TECH', name: 'Lego Technic', description: 'Mô hình cơ khí chuyển động' },
    { category_code: 'BB', code: 'BARBIE', name: 'Búp bê Barbie', description: 'Búp bê thời trang khớp linh hoạt' },
    { category_code: 'GD', code: 'WOODEN', name: 'Đồ chơi gỗ thông minh', description: 'Xếp hình khối, bảng tính gỗ' },
  ];

  const insertType = db.prepare(`
    INSERT OR IGNORE INTO product_types (category_id, code, name, description, status)
    VALUES (?, ?, ?, ?, 'ACTIVE')
  `);

  for (const pt of productTypes) {
    const catId = getCatId(pt.category_code);
    insertType.run(catId, pt.code, pt.name, pt.description);
  }

  // 4. Products & Initial Stock / Price
  const getTypeId = (code) => db.prepare('SELECT id FROM product_types WHERE code = ?').get(code).id;

  const sampleProducts = [
    {
      sku: 'GB001',
      name: 'Gấu Capybara Rút Nước Mũi 40cm',
      cat: 'GB',
      type: 'CAPYBARA',
      cost: 95000,
      price: 165000,
      stock: 35,
      minAlert: 5,
    },
    {
      sku: 'GB002',
      name: 'Gấu Bông Capybara Đeo Balo Rùa 50cm',
      cat: 'GB',
      type: 'CAPYBARA',
      cost: 120000,
      price: 210000,
      stock: 28,
      minAlert: 5,
    },
    {
      sku: 'GB003',
      name: 'Gấu Teddy Nơ Nhung Cỡ Lớn 80cm',
      cat: 'GB',
      type: 'TEDDY',
      cost: 190000,
      price: 330000,
      stock: 15,
      minAlert: 3,
    },
    {
      sku: 'XE001',
      name: 'Xe Địa Hình Điều Khiển Tốc Độ Cao 4WD Rock Crawler',
      cat: 'XE',
      type: 'RC_CAR',
      cost: 220000,
      price: 390000,
      stock: 20,
      minAlert: 4,
    },
    {
      sku: 'XE002',
      name: 'Xe Mô Hình Kim Loại Rolls-Royce Phantom 1:24 Có Đèn Nhạc',
      cat: 'XE',
      type: 'DIECAST',
      cost: 160000,
      price: 280000,
      stock: 18,
      minAlert: 4,
    },
    {
      sku: 'LG001',
      name: 'Bộ Xếp Hình Lego City Trạm Cứu Hoả Trung Tâm 500 Chi Tiết',
      cat: 'LEGO',
      type: 'LEGO_CITY',
      cost: 320000,
      price: 550000,
      stock: 12,
      minAlert: 3,
    },
    {
      sku: 'LG002',
      name: 'Bộ Lắp Ghép Siêu Xe Thể Thao Technic Tỉ Lệ 1:14',
      cat: 'LEGO',
      type: 'LEGO_TECH',
      cost: 380000,
      price: 680000,
      stock: 10,
      minAlert: 2,
    },
    {
      sku: 'BB001',
      name: 'Búp Bê Barbie Công Chúa Kèm Tủ Quần Áo Thời Trang',
      cat: 'BB',
      type: 'BARBIE',
      cost: 140000,
      price: 250000,
      stock: 22,
      minAlert: 5,
    },
    {
      sku: 'GD001',
      name: 'Bảng Học Số Đếm & Câu Cá Gỗ Đa Năng Montessori',
      cat: 'GD',
      type: 'WOODEN',
      cost: 75000,
      price: 135000,
      stock: 40,
      minAlert: 8,
    }
  ];

  const insertProd = db.prepare(`
    INSERT OR IGNORE INTO products (
      sku, name, category_id, product_type_id,
      current_cost_price, current_selling_price, current_stock,
      min_stock_alert, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
  `);

  const insertPriceHistory = db.prepare(`
    INSERT INTO price_history (product_id, price, effective_from, note, created_by)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertCostHistory = db.prepare(`
    INSERT INTO cost_price_history (product_id, cost_price, effective_from, note, created_by)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertStockMovement = db.prepare(`
    INSERT INTO stock_movements (
      product_id, movement_type, quantity_change, balance_after,
      movement_date, reference_type, note, created_by
    ) VALUES (?, 'PURCHASE', ?, ?, '2026-08-01', 'INITIAL_IMPORT', 'Khởi tạo tồn kho ban đầu', ?)
  `);

  for (const p of sampleProducts) {
    const catId = getCatId(p.cat);
    const typeId = getTypeId(p.type);
    
    insertProd.run(
      p.sku,
      p.name,
      catId,
      typeId,
      p.cost,
      p.price,
      p.stock,
      p.minAlert
    );

    const prod = db.prepare('SELECT id FROM products WHERE sku = ?').get(p.sku);
    if (prod) {
      const existingPrice = db.prepare('SELECT id FROM price_history WHERE product_id = ?').get(prod.id);
      if (!existingPrice) {
        insertPriceHistory.run(prod.id, p.price, '2026-08-01', 'Giá niêm yết ban đầu', adminId);
        insertCostHistory.run(prod.id, p.cost, '2026-08-01', 'Giá vốn nhập ban đầu', adminId);
        insertStockMovement.run(prod.id, p.stock, p.stock, adminId);
      }
    }
  }

  // 5. Seed some sample sales transactions to verify calculation accuracy
  const sampleProductGB1 = db.prepare('SELECT id, current_cost_price, current_selling_price FROM products WHERE sku = ?').get('GB001');
  const sampleProductXE1 = db.prepare('SELECT id, current_cost_price, current_selling_price FROM products WHERE sku = ?').get('XE001');

  if (sampleProductGB1 && sampleProductXE1) {
    const existingSales = db.prepare('SELECT COUNT(*) as count FROM sales_records').get();
    if (existingSales.count === 0) {
      const insertSale = db.prepare(`
        INSERT INTO sales_records (
          transaction_code, product_id, sale_date, quantity,
          unit_price_at_sale, cost_price_at_sale, total_revenue, total_cost, profit,
          note, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // Sale 1 on 2026-08-10: 2 x GB001 @ 165,000
      insertSale.run(
        'TX-20260810-0001',
        sampleProductGB1.id,
        '2026-08-10',
        2,
        165000,
        95000,
        330000,
        190000,
        140000,
        'Khách mua trực tiếp',
        adminId
      );

      db.prepare(`
        INSERT INTO stock_movements (
          product_id, movement_type, quantity_change, balance_after,
          movement_date, reference_type, note, created_by
        ) VALUES (?, 'SALE', -2, 33, '2026-08-10', 'sales_records', 'Bán hàng TX-20260810-0001', ?)
      `).run(sampleProductGB1.id, adminId);

      db.prepare('UPDATE products SET current_stock = 33 WHERE id = ?').run(sampleProductGB1.id);

      // Sale 2 on 2026-08-15: 1 x XE001 @ 390,000
      insertSale.run(
        'TX-20260815-0002',
        sampleProductXE1.id,
        '2026-08-15',
        1,
        390000,
        220000,
        390000,
        220000,
        170000,
        'Khách mua quầy',
        adminId
      );

      db.prepare(`
        INSERT INTO stock_movements (
          product_id, movement_type, quantity_change, balance_after,
          movement_date, reference_type, note, created_by
        ) VALUES (?, 'SALE', -1, 19, '2026-08-15', 'sales_records', 'Bán hàng TX-20260815-0002', ?)
      `).run(sampleProductXE1.id, adminId);

      db.prepare('UPDATE products SET current_stock = 19 WHERE id = ?').run(sampleProductXE1.id);
    }
  }

  // 6. Log Audit
  db.prepare(`
    INSERT INTO audit_logs (user_id, action, entity_name, entity_id, old_value_json, new_value_json)
    VALUES (?, 'SYSTEM_SEED', 'SYSTEM', '1', NULL, '{"message": "Khởi tạo hệ thống ban đầu thành công"}')
  `).run(adminId);
});

seedTx();
console.log('--- SEEDING COMPLETED SUCCESSFULLY ---');
db.close();
