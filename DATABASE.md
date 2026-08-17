# THIẾT KẾ CƠ SỞ DỮ LIỆU (DATABASE.MD)
**T_SHOP Database Schema & Data Integrity Design**

---

## 1. SƠ ĐỒ THỰC THỂ LIÊN KẾT (ER DIAGRAM)

```mermaid
erDiagram
    USERS ||--o{ SALES_RECORDS : records
    USERS ||--o{ STOCK_MOVEMENTS : creates
    USERS ||--o{ AUDIT_LOGS : performs
    USERS ||--o{ IMPORTS : creates

    CATEGORIES ||--o{ PRODUCT_TYPES : contains
    CATEGORIES ||--o{ PRODUCTS : categorizes
    PRODUCT_TYPES ||--o{ PRODUCTS : classifies

    PRODUCTS ||--o{ PRICE_HISTORY : has
    PRODUCTS ||--o{ COST_PRICE_HISTORY : has
    PRODUCTS ||--o{ SALES_RECORDS : generates
    PRODUCTS ||--o{ STOCK_MOVEMENTS : moves
    PRODUCTS ||--o{ IMPORT_ITEMS : includes

    SUPPLIERS ||--o{ IMPORTS : supplies
    IMPORTS ||--o{ IMPORT_ITEMS : contains

    USERS {
        int id PK
        string username UK
        string password_hash
        string full_name
        string role
        string status
        datetime created_at
        datetime updated_at
    }

    CATEGORIES {
        int id PK
        string code UK
        string name
        string description
        string status
        datetime created_at
        datetime updated_at
    }

    PRODUCT_TYPES {
        int id PK
        int category_id FK
        string code UK
        string name
        string description
        string status
        datetime created_at
        datetime updated_at
    }

    PRODUCTS {
        int id PK
        string sku UK
        string name
        int category_id FK
        int product_type_id FK
        decimal current_cost_price
        decimal current_selling_price
        int current_stock
        int min_stock_alert
        string status
        datetime created_at
        datetime updated_at
    }

    PRICE_HISTORY {
        int id PK
        int product_id FK
        decimal price
        date effective_from
        string note
        int created_by FK
        datetime created_at
    }

    COST_PRICE_HISTORY {
        int id PK
        int product_id FK
        decimal cost_price
        date effective_from
        string note
        int created_by FK
        datetime created_at
    }

    SALES_RECORDS {
        int id PK
        string transaction_code UK
        int product_id FK
        date sale_date
        int quantity
        decimal unit_price_at_sale
        decimal cost_price_at_sale
        decimal total_revenue
        decimal total_cost
        decimal profit
        string note
        int created_by FK
        datetime created_at
    }

    STOCK_MOVEMENTS {
        int id PK
        int product_id FK
        string movement_type
        int quantity_change
        int balance_after
        date movement_date
        string reference_type
        int reference_id
        string note
        int created_by FK
        datetime created_at
    }

    SUPPLIERS {
        int id PK
        string code UK
        string name
        string phone
        string address
        string status
        datetime created_at
        datetime updated_at
    }

    IMPORTS {
        int id PK
        string import_code UK
        int supplier_id FK
        date import_date
        decimal total_amount
        string note
        int created_by FK
        datetime created_at
    }

    IMPORT_ITEMS {
        int id PK
        int import_id FK
        int product_id FK
        int quantity
        decimal unit_cost_price
        decimal total_amount
        datetime created_at
    }

    IMPORT_LOGS {
        int id PK
        string file_name
        string entity_type
        int total_rows
        int valid_rows
        int error_rows
        int created_rows
        int updated_rows
        string status
        string details_json
        int created_by FK
        datetime created_at
    }

    AUDIT_LOGS {
        int id PK
        int user_id FK
        string action
        string entity_name
        string entity_id
        string old_value_json
        string new_value_json
        string ip_address
        datetime created_at
    }
```

---

## 2. CHI TIẾT CÁC BẢNG DỮ LIỆU & RÀNG BUỘC (DATA DICTIONARY)

### 2.1. Bảng `users` (Tài khoản người dùng)
| Tên cột | Kiểu dữ liệu | Ràng buộc | Ý nghĩa |
| :--- | :--- | :--- | :--- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Mã định danh người dùng |
| `username` | VARCHAR(50) | UNIQUE, NOT NULL | Tên đăng nhập |
| `password_hash` | VARCHAR(255) | NOT NULL | Mật khẩu mã hoá (bcrypt/argon2) |
| `full_name` | VARCHAR(100) | NOT NULL | Họ và tên nhân viên/quản lý |
| `role` | VARCHAR(20) | NOT NULL, CHECK in ('ADMIN', 'STAFF') | Quyền hạn |
| `status` | VARCHAR(20) | DEFAULT 'ACTIVE' | ACTIVE / INACTIVE |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Ngày tạo |
| `updated_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Ngày cập nhật |

### 2.2. Bảng `categories` (Danh mục sản phẩm)
| Tên cột | Kiểu dữ liệu | Ràng buộc | Ý nghĩa |
| :--- | :--- | :--- | :--- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Mã danh mục |
| `code` | VARCHAR(50) | UNIQUE, NOT NULL | Mã code (VD: `GAU_BONG`, `LEGO`) |
| `name` | VARCHAR(150) | NOT NULL | Tên danh mục (VD: Gấu bông) |
| `description` | TEXT | NULL | Mô tả chi tiết |
| `status` | VARCHAR(20) | DEFAULT 'ACTIVE' | ACTIVE / INACTIVE |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Ngày tạo |
| `updated_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Ngày cập nhật |

### 2.3. Bảng `product_types` (Loại sản phẩm)
| Tên cột | Kiểu dữ liệu | Ràng buộc | Ý nghĩa |
| :--- | :--- | :--- | :--- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Mã loại sản phẩm |
| `category_id` | INTEGER | NOT NULL, FK $\rightarrow$ `categories(id)` | Thuộc danh mục |
| `code` | VARCHAR(50) | UNIQUE, NOT NULL | Mã loại (VD: `CAPYBARA`, `RC_CAR`) |
| `name` | VARCHAR(150) | NOT NULL | Tên loại sản phẩm (VD: Capybara) |
| `description` | TEXT | NULL | Mô tả |
| `status` | VARCHAR(20) | DEFAULT 'ACTIVE' | ACTIVE / INACTIVE |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Ngày tạo |
| `updated_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Ngày cập nhật |

### 2.4. Bảng `products` (Thông tin sản phẩm)
| Tên cột | Kiểu dữ liệu | Ràng buộc | Ý nghĩa |
| :--- | :--- | :--- | :--- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Mã định danh sản phẩm |
| `sku` | VARCHAR(50) | UNIQUE, NOT NULL | Mã SKU định danh duy nhất (VD: `GB001`) |
| `name` | VARCHAR(255) | NOT NULL | Tên sản phẩm |
| `category_id` | INTEGER | NOT NULL, FK $\rightarrow$ `categories(id)` | Danh mục |
| `product_type_id` | INTEGER | NOT NULL, FK $\rightarrow$ `product_types(id)`| Loại sản phẩm |
| `current_cost_price` | DECIMAL(15,2)| DEFAULT 0 | Giá nhập hiện hành |
| `current_selling_price`| DECIMAL(15,2)| DEFAULT 0 | Giá bán hiện hành |
| `current_stock` | INTEGER | DEFAULT 0 | Tồn kho hiện tại (cached balance) |
| `min_stock_alert` | INTEGER | DEFAULT 5 | Ngưỡng cảnh báo tồn ít |
| `status` | VARCHAR(20) | DEFAULT 'ACTIVE', CHECK in ('ACTIVE', 'INACTIVE') | Trạng thái kinh doanh |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Ngày tạo |
| `updated_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Ngày cập nhật |

### 2.5. Bảng `price_history` (Lịch sử giá bán theo ngày)
*Quy tắc: Không update bản ghi cũ, mỗi lần đổi giá thêm 1 bản ghi mới.*
| Tên cột | Kiểu dữ liệu | Ràng buộc | Ý nghĩa |
| :--- | :--- | :--- | :--- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Khóa chính |
| `product_id` | INTEGER | NOT NULL, FK $\rightarrow$ `products(id)` | Sản phẩm |
| `price` | DECIMAL(15,2)| NOT NULL, CHECK (price >= 0) | Mức giá bán áp dụng |
| `effective_from` | DATE | NOT NULL | Ngày bắt đầu áp dụng |
| `note` | VARCHAR(255) | NULL | Ghi chú lý do đổi giá |
| `created_by` | INTEGER | NULL, FK $\rightarrow$ `users(id)` | Người thực hiện |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Thời điểm tạo |

### 2.6. Bảng `cost_price_history` (Lịch sử giá vốn/nhập theo ngày)
| Tên cột | Kiểu dữ liệu | Ràng buộc | Ý nghĩa |
| :--- | :--- | :--- | :--- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Khóa chính |
| `product_id` | INTEGER | NOT NULL, FK $\rightarrow$ `products(id)` | Sản phẩm |
| `cost_price` | DECIMAL(15,2)| NOT NULL, CHECK (cost_price >= 0) | Mức giá vốn |
| `effective_from` | DATE | NOT NULL | Ngày áp dụng |
| `note` | VARCHAR(255) | NULL | Ghi chú |
| `created_by` | INTEGER | NULL, FK $\rightarrow$ `users(id)` | Người thực hiện |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Thời điểm tạo |

### 2.7. Bảng `sales_records` (Ghi nhận bán hàng - Snapshot Transaction)
| Tên cột | Kiểu dữ liệu | Ràng buộc | Ý nghĩa |
| :--- | :--- | :--- | :--- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Khóa chính |
| `transaction_code` | VARCHAR(50) | UNIQUE, NOT NULL | Mã giao dịch bán (VD: `TX-20260817-0001`) |
| `product_id` | INTEGER | NOT NULL, FK $\rightarrow$ `products(id)` | Sản phẩm bán |
| `sale_date` | DATE | NOT NULL | Ngày bán ghi nhận |
| `quantity` | INTEGER | NOT NULL, CHECK (quantity > 0) | Số lượng bán |
| `unit_price_at_sale` | DECIMAL(15,2)| NOT NULL | Snapshot giá bán tại ngày bán |
| `cost_price_at_sale` | DECIMAL(15,2)| NOT NULL | Snapshot giá vốn tại ngày bán |
| `total_revenue` | DECIMAL(15,2)| NOT NULL | `quantity * unit_price_at_sale` |
| `total_cost` | DECIMAL(15,2)| NOT NULL | `quantity * cost_price_at_sale` |
| `profit` | DECIMAL(15,2)| NOT NULL | `total_revenue - total_cost` |
| `note` | VARCHAR(255) | NULL | Ghi chú |
| `created_by` | INTEGER | NULL, FK $\rightarrow$ `users(id)` | Nhân viên ghi nhận |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Thời điểm lưu bản ghi |

### 2.8. Bảng `stock_movements` (Lịch sử biến động kho - Append Only)
| Tên cột | Kiểu dữ liệu | Ràng buộc | Ý nghĩa |
| :--- | :--- | :--- | :--- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Khóa chính |
| `product_id` | INTEGER | NOT NULL, FK $\rightarrow$ `products(id)` | Sản phẩm |
| `movement_type` | VARCHAR(20) | NOT NULL, CHECK in ('SALE', 'PURCHASE', 'DAMAGE', 'LOSS', 'GIFT', 'RETURN', 'ADJUSTMENT') | Loại biến động |
| `quantity_change` | INTEGER | NOT NULL | Số lượng thay đổi (+ nhập, - xuất) |
| `balance_after` | INTEGER | NOT NULL | Tồn kho sau khi thực hiện biến động |
| `movement_date` | DATE | NOT NULL | Ngày phát sinh biến động |
| `reference_type` | VARCHAR(50) | NULL | Bảng liên kết (`sales_records`, `imports`, `adjustments`) |
| `reference_id` | INTEGER | NULL | ID tham chiếu |
| `note` | TEXT | NULL | Lý do điều chỉnh/ghi chú |
| `created_by` | INTEGER | NULL, FK $\rightarrow$ `users(id)` | Người thực hiện |
| `created_at` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Thời gian ghi nhận |

### 2.9. Bảng `suppliers` & `imports` & `import_items` (Nhập kho từ NCC)
* Quản lý phiếu nhập kho chi tiết, ghi nhận giá nhập cụ thể theo từng lô/lần nhập.
* Khi nhập kho commit, tự động cập nhật `current_stock`, tạo `stock_movements` (type = `PURCHASE`) và thêm vào `cost_price_history`.

### 2.10. Bảng `audit_logs` (Nhật ký kiểm toán)
* Ghi lại chi tiết: Người thực hiện, hành động (`CREATE_PRODUCT`, `UPDATE_PRICE`, `ADJUST_STOCK`, `IMPORT_EXCEL`, ...), giá trị trước và sau (`old_value_json`, `new_value_json`), IP và thời điểm.

---

## 3. INDEXES TỐI ƯU TRUY VẤN (QUERY OPTIMIZATION INDEXES)

```sql
-- Indexes cho tìm kiếm sản phẩm nhanh (autocomplete / search <= 5s)
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_cat_type ON products(category_id, product_type_id);
CREATE INDEX idx_products_status ON products(status);

-- Indexes cho tra cứu lịch sử giá theo ngày
CREATE INDEX idx_price_history_lookup ON price_history(product_id, effective_from DESC);
CREATE INDEX idx_cost_price_history_lookup ON cost_price_history(product_id, effective_from DESC);

-- Indexes cho báo cáo doanh thu & bán hàng
CREATE INDEX idx_sales_records_date ON sales_records(sale_date);
CREATE INDEX idx_sales_records_product_date ON sales_records(product_id, sale_date);

-- Indexes cho lịch sử biến động kho
CREATE INDEX idx_stock_movements_prod_date ON stock_movements(product_id, movement_date);
CREATE INDEX idx_stock_movements_type ON stock_movements(movement_type);

-- Indexes cho Audit log
CREATE INDEX idx_audit_logs_user_date ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_name, entity_id);
```

---

## 4. LOGIC XÁC ĐỊNH GIÁ BÁN THEO NGÀY (PRICE RESOLUTION LOGIC)

Khi người dùng ghi nhận bán vào ngày `X` cho sản phẩm `P`:
```sql
SELECT price 
FROM price_history 
WHERE product_id = :productId 
  AND effective_from <= :saleDate 
ORDER BY effective_from DESC, id DESC 
LIMIT 1;
```
Nếu không tìm thấy lịch sử trước ngày `X`, hệ thống sẽ lấy `products.current_selling_price` làm fallback mặc định và tự động chèn bản ghi khởi tạo.
Sau đó, giá trị này được snapshot cố định vào `sales_records.unit_price_at_sale`.
Mọi báo cáo doanh thu chỉ tính toán dựa trên `sales_records.unit_price_at_sale`.
