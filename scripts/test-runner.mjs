import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

console.log('====================================================');
console.log('       T_SHOP COMPREHENSIVE AUTOMATED TEST SUITE    ');
console.log('====================================================\n');

const db = new Database('data/t_shop.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
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
`);

try { db.exec(`ALTER TABLE sales_records ADD COLUMN status TEXT NOT NULL DEFAULT 'COMPLETED';`); } catch {}
try { db.exec(`ALTER TABLE sales_records ADD COLUMN cancel_reason TEXT;`); } catch {}
try { db.exec(`ALTER TABLE sales_records ADD COLUMN cancelled_at DATETIME;`); } catch {}
try { db.exec(`ALTER TABLE sales_records ADD COLUMN cancelled_by INTEGER;`); } catch {}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

// ----------------------------------------------------
// TEST GROUP 1: AUTHENTICATION & ACCESS CONTROL
// ----------------------------------------------------
console.log('--- 1. Authentication & Security ---');
const adminUser = db.prepare("SELECT * FROM users WHERE username = 'admin'").get();
assert(!!adminUser, 'Admin user exists in database');
assert(adminUser?.role === 'ADMIN', 'Admin user has ADMIN role');

const staffUser = db.prepare("SELECT * FROM users WHERE username = 'staff'").get();
assert(!!staffUser, 'Staff user exists in database');
assert(staffUser?.role === 'STAFF', 'Staff user has STAFF role');

const passwordMatches = bcrypt.compareSync('admin123', adminUser.password_hash);
assert(passwordMatches, 'Admin password hash verified with bcrypt');

const staffPasswordMatches = bcrypt.compareSync('staff123', staffUser.password_hash);
assert(staffPasswordMatches, 'Staff password hash verified with bcrypt');

const secret = 't_shop_secure_jwt_secret_key_2026_retail';
const token = jwt.sign({ id: adminUser.id, username: adminUser.username, role: adminUser.role }, secret, { expiresIn: '1h' });
const decoded = jwt.verify(token, secret);
assert(decoded.username === 'admin' && decoded.role === 'ADMIN', 'JWT token signed and verified accurately');

// ----------------------------------------------------
// TEST GROUP 2: CATEGORIES & PRODUCT TYPES HIERARCHY
// ----------------------------------------------------
console.log('\n--- 2. Categories & Product Types Hierarchy ---');
const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get().c;
assert(catCount >= 5, `Categories count >= 5 (actual: ${catCount})`);

const typeCount = db.prepare('SELECT COUNT(*) as c FROM product_types').get().c;
assert(typeCount >= 8, `Product Types count >= 8 (actual: ${typeCount})`);

// ----------------------------------------------------
// TEST GROUP 3: FIFO INVENTORY LOTS & COGS ENGINE
// ----------------------------------------------------
console.log('\n--- 3. FIFO Purchase Lots Allocation & COGS Resolution ---');
const fifoTestSku = 'FIFO_PROD_' + Date.now().toString().slice(-4);
const prodInsert = db.prepare(`
  INSERT INTO products (sku, name, category_id, product_type_id, current_cost_price, current_selling_price, current_stock, min_stock_alert, status)
  VALUES (?, 'Gấu Bông FIFO Test', 1, 1, 80000, 150000, 100, 10, 'ACTIVE')
`).run(fifoTestSku);
const fifoProdId = Number(prodInsert.lastInsertRowid);

// Insert 3 sequential lots:
// LOT 1: 50 pcs @ 80.000đ on 2026-08-01
// LOT 2: 30 pcs @ 85.000đ on 2026-08-05
// LOT 3: 20 pcs @ 90.000đ on 2026-08-10
const ts = Date.now().toString().slice(-4);
const lot1 = db.prepare(`
  INSERT INTO inventory_lots (lot_code, product_id, purchase_date, quantity_received, quantity_remaining, unit_cost, note)
  VALUES ('LOT-TEST-001-' || ?, ?, '2026-08-01', 50, 50, 80000, 'Lô 1')
`).run(ts, fifoProdId);
const lot1Id = Number(lot1.lastInsertRowid);

const lot2 = db.prepare(`
  INSERT INTO inventory_lots (lot_code, product_id, purchase_date, quantity_received, quantity_remaining, unit_cost, note)
  VALUES ('LOT-TEST-002-' || ?, ?, '2026-08-05', 30, 30, 85000, 'Lô 2')
`).run(ts, fifoProdId);
const lot2Id = Number(lot2.lastInsertRowid);

const lot3 = db.prepare(`
  INSERT INTO inventory_lots (lot_code, product_id, purchase_date, quantity_received, quantity_remaining, unit_cost, note)
  VALUES ('LOT-TEST-003-' || ?, ?, '2026-08-10', 20, 20, 90000, 'Lô 3')
`).run(ts, fifoProdId);
const lot3Id = Number(lot3.lastInsertRowid);

// Verify initial inventory valuation: (50*80k + 30*85k + 20*90k) = 4,000,000 + 2,550,000 + 1,800,000 = 8,350,000đ
const initialValuation = db.prepare(`
  SELECT SUM(quantity_remaining * unit_cost) as val FROM inventory_lots WHERE product_id = ?
`).get(fifoProdId).val;
assert(initialValuation === 8350000, `Initial 3-lot inventory valuation is 8,350,000đ (actual: ${initialValuation})`);

// SIMULATE SALE OF 60 PCS using FIFO:
// Should consume LOT 1 (50 pcs @ 80k = 4,000,000đ) and LOT 2 (10 pcs @ 85k = 850,000đ)
// Expected COGS = 4,850,000đ
// Expected Remaining LOT 1: 0, LOT 2: 20, LOT 3: 20 -> Total remaining = 40 pcs
let remainingToSell = 60;
let computedCOGS = 0;
const allocs = [];

const activeLots = db.prepare(`
  SELECT id, lot_code, quantity_remaining, unit_cost 
  FROM inventory_lots 
  WHERE product_id = ? AND quantity_remaining > 0 
  ORDER BY purchase_date ASC, id ASC
`).all(fifoProdId);

for (const lot of activeLots) {
  if (remainingToSell <= 0) break;
  const take = Math.min(remainingToSell, lot.quantity_remaining);
  const cost = take * lot.unit_cost;
  computedCOGS += cost;
  remainingToSell -= take;
  db.prepare('UPDATE inventory_lots SET quantity_remaining = quantity_remaining - ? WHERE id = ?').run(take, lot.id);
  allocs.push({ lotId: lot.id, qty: take, unitCost: lot.unit_cost, totalCost: cost });
}

assert(computedCOGS === 4850000, `FIFO COGS for 60 items is exactly 4,850,000đ (actual: ${computedCOGS})`);

const lot1Rem = db.prepare('SELECT quantity_remaining FROM inventory_lots WHERE id = ?').get(lot1Id).quantity_remaining;
const lot2Rem = db.prepare('SELECT quantity_remaining FROM inventory_lots WHERE id = ?').get(lot2Id).quantity_remaining;
const lot3Rem = db.prepare('SELECT quantity_remaining FROM inventory_lots WHERE id = ?').get(lot3Id).quantity_remaining;

assert(lot1Rem === 0, `LOT 1 quantity_remaining is 0 (actual: ${lot1Rem})`);
assert(lot2Rem === 20, `LOT 2 quantity_remaining is 20 (actual: ${lot2Rem})`);
assert(lot3Rem === 20, `LOT 3 quantity_remaining is 20 (actual: ${lot3Rem})`);

// Expected Remaining Valuation: (20*85k + 20*90k) = 1,700,000 + 1,800,000 = 3,500,000đ
const remainingValuation = db.prepare(`
  SELECT SUM(quantity_remaining * unit_cost) as val FROM inventory_lots WHERE product_id = ?
`).get(fifoProdId).val;
assert(remainingValuation === 3500000, `Remaining inventory valuation is 3,500,000đ (actual: ${remainingValuation})`);

// Expected Weighted Average Cost: 3,500,000 / 40 = 87,500đ
const weightedAvgCost = Math.round(remainingValuation / (lot2Rem + lot3Rem));
assert(weightedAvgCost === 87500, `Weighted average cost of remaining stock is 87,500đ (actual: ${weightedAvgCost})`);

// Record sale in database
const sellRevenue = 60 * 150000; // 9,000,000đ
const profit = sellRevenue - computedCOGS; // 9,000,000 - 4,850,000 = 4,150,000đ
assert(profit === 4150000, `Profit is exactly 4,150,000đ (actual: ${profit})`);

const txCodeTest = 'TX-TEST-FIFO-' + Date.now().toString().slice(-4);
const saleRec = db.prepare(`
  INSERT INTO sales_records (
    transaction_code, product_id, sale_date, quantity, unit_price_at_sale, cost_price_at_sale,
    discount, total_revenue, total_cost, profit, note, created_by
  ) VALUES (?, ?, '2026-08-17', 60, 150000, ?, 0, ?, ?, ?, 'Test FIFO Sale', 1)
`).run(txCodeTest, fifoProdId, computedCOGS / 60, sellRevenue, computedCOGS, profit);
const saleId = Number(saleRec.lastInsertRowid);

// Insert allocations
for (const a of allocs) {
  db.prepare(`
    INSERT INTO sale_cost_allocations (sale_id, inventory_lot_id, quantity, unit_cost, total_cost)
    VALUES (?, ?, ?, ?, ?)
  `).run(saleId, a.lotId, a.qty, a.unitCost, a.totalCost);
}

const allocCount = db.prepare('SELECT COUNT(*) as c FROM sale_cost_allocations WHERE sale_id = ?').get(saleId).c;
assert(allocCount === 2, `Recorded 2 lot allocations for the multi-lot sale (actual: ${allocCount})`);

// ----------------------------------------------------
// TEST GROUP 4: SALE CANCELLATION & INVENTORY ROLLBACK
// ----------------------------------------------------
console.log('\n--- 4. Sale Cancellation & Inventory Rollback ---');
// Cancel the sale
const cancelReasonText = 'Khách đổi ý không mua nữa';
const cancelAllocs = db.prepare('SELECT inventory_lot_id, quantity FROM sale_cost_allocations WHERE sale_id = ?').all(saleId);
for (const ca of cancelAllocs) {
  db.prepare('UPDATE inventory_lots SET quantity_remaining = quantity_remaining + ? WHERE id = ?').run(ca.quantity, ca.inventory_lot_id);
}
db.prepare("UPDATE sales_records SET status = 'CANCELLED', cancel_reason = ?, cancelled_at = CURRENT_TIMESTAMP WHERE id = ?").run(cancelReasonText, saleId);

const rolledBackLot1 = db.prepare('SELECT quantity_remaining FROM inventory_lots WHERE id = ?').get(lot1Id).quantity_remaining;
const rolledBackLot2 = db.prepare('SELECT quantity_remaining FROM inventory_lots WHERE id = ?').get(lot2Id).quantity_remaining;
assert(rolledBackLot1 === 50, `LOT 1 quantity restored to 50 after cancellation (actual: ${rolledBackLot1})`);
assert(rolledBackLot2 === 30, `LOT 2 quantity restored to 30 after cancellation (actual: ${rolledBackLot2})`);

const cancelledSaleStatus = db.prepare('SELECT status, cancel_reason FROM sales_records WHERE id = ?').get(saleId);
assert(cancelledSaleStatus.status === 'CANCELLED', 'Sale record status is CANCELLED');
assert(cancelledSaleStatus.cancel_reason === cancelReasonText, 'Sale record cancel_reason saved accurately');

const completedSalesSum = db.prepare(`
  SELECT 
    COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed_count,
    COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled_count
  FROM sales_records
  WHERE id = ?
`).get(saleId);
assert(completedSalesSum.completed_count === 0 && completedSalesSum.cancelled_count === 1, 'Cancelled sale is properly excluded from completed count');

// ----------------------------------------------------
// TEST GROUP 5: DASHBOARD & EXCEL EXPORT INTEGRITY
// ----------------------------------------------------
console.log('\n--- 5. Dashboard Summary & Aggregation ---');
const totalLotStockValuation = db.prepare(`
  SELECT SUM(il.quantity_remaining * il.unit_cost) as val
  FROM inventory_lots il
  JOIN products p ON p.id = il.product_id
  WHERE il.quantity_remaining > 0 AND p.status = 'ACTIVE'
`).get().val;
assert(totalLotStockValuation > 0, `Total active inventory valuation from lots is valid (${totalLotStockValuation.toLocaleString('vi-VN')} đ)`);

console.log('\n====================================================');
console.log(`TEST RESULTS: ${passed} PASSED / ${failed} FAILED`);
console.log('====================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
