# KẾ HOẠCH TRIỂN KHAI HỆ THỐNG QUẢN LÝ SHOP ĐỒ CHƠI (T_SHOP)

## 1. KẾT QUẢ AUDIT PROJECT HIỆN TẠI

1. **Tech stack hiện tại**: Thư mục workspace `d:\project\T_SHOP` là thư mục mới, trống hoàn toàn.
2. **Cấu trúc project hiện tại**: Chưa khởi tạo source code.
3. **Database hiện tại**: Chưa có.
4. **Những chức năng đã có**: 0% (Chưa có code cũ, không bị vướng technical debt cũ).
5. **Những chức năng còn thiếu**: Toàn bộ 13 modules theo yêu cầu (Auth & Layout, Categories & Types, Products, Price History, Inventory Movements, Sales Recording, Dashboard Stats & Master Aggregation Table, Reports, Excel Engine Preview & Commit, Audit Log, Test Suite).
6. **Những vấn đề kiến trúc cần lưu ý**:
   * Phải tránh hoàn toàn kiến trúc mock/UI-only.
   * Mọi thao tác bán hàng & nhập hàng phải nằm trong ACID transaction.
   * Giá bán và giá vốn phải được snapshot lịch sử theo ngày, không được tính lại doanh thu quá khứ bằng giá hiện tại.
   * UI phải tuân thủ nghiêm ngặt phong cách **Professional Retail Management** (Data-first, sạch sẽ, không gradient/neon/AI flashy animations, tối ưu mobile cho màn ghi nhận bán <= 5s).

---

## 2. ĐỀ XUẤT ARCHITECTURE & TECH STACK

* **Backend / Fullstack Runtime**: Node.js với TypeScript, Next.js App Router hoặc React + Fastify/Express API server.
* **Database**: SQLite với Write-Ahead Logging (`WAL` mode) + `better-sqlite3` / `Prisma` / `Kysely` (hoặc Raw SQL migrations có kiểm soát), đảm bảo 100% ACID transaction, foreign keys, và zero-setup overhead. Dễ dàng sao lưu và khôi phục.
* **Frontend**: React + Vanilla CSS Design System chuyên nghiệp (Inter/system-ui font, bảng dữ liệu tối ưu, phân trang, debounced search, responsive mobile cho bán hàng).
* **Excel Engine**: `xlsx` / `exceljs` với streaming parser, formula sanitization, schema validation và Diff preview logic.
* **Testing**: Vitest / Playwright / Jest cho unit test, integration test nghiệp vụ bán hàng, kho, giá lịch sử và transaction safety.

---

## 3. LỘ TRÌNH TRIỂN KHAI 13 PHASES (IMPLEMENTATION ROADMAP)

### PHASE 1: Architecture & Database Foundations
- [ ] Khởi tạo project structure với TypeScript và build configuration chuẩn.
- [ ] Thiết lập SQLite Database kết nối với Foreign Keys và WAL Mode.
- [ ] Xây dựng file migrations & schema cho toàn bộ 12+ bảng (`users`, `categories`, `product_types`, `products`, `price_history`, `cost_price_history`, `sales_records`, `stock_movements`, `suppliers`, `imports`, `import_items`, `import_logs`, `audit_logs`).
- [ ] Xây dựng Database Transaction Helper & Query Repositories.
- [ ] Seed dữ liệu ban đầu (Tài khoản Admin, Danh mục mẫu, Sản phẩm mẫu).

### PHASE 2: Authentication, Security & Professional Layout
- [ ] Hệ thống Auth (JWT / Session token, bcrypt password hashing, Role-based permission: `ADMIN`, `STAFF`).
- [ ] Xây dựng Layout chuyên nghiệp: Sidebar (8 mục chuẩn), Top Header, Breadcrumbs, User menu.
- [ ] Design System CSS: Color tokens (Trung tính + Primary xanh navy/slate), Typography (Inter), Tables, Buttons, Forms, Modals, Toasts.

### PHASE 3: Categories & Product Types Management
- [ ] CRUD API & UI cho Danh mục sản phẩm (`/api/categories`).
- [ ] CRUD API & UI cho Loại sản phẩm (`/api/product-types`) theo cấu trúc phân cấp (Danh mục $\rightarrow$ Loại sản phẩm).
- [ ] Ràng buộc toàn vẹn: Chặn xoá danh mục/loại khi còn sản phẩm liên kết.

### PHASE 4: Products Management
- [ ] CRUD API & UI Quản lý sản phẩm (SKU duy nhất, Tên, Danh mục, Loại, Giá nhập, Giá bán, Tồn tối thiểu, Trạng thái `ACTIVE`/`INACTIVE`).
- [ ] Tìm kiếm nhanh (Search theo Tên, SKU), Bộ lọc đa chiều, Phân trang.
- [ ] Chuyển trạng thái ngừng bán (`inactive`) thay vì xoá cứng khi đã có phát sinh giao dịch.

### PHASE 5: Price History & Cost Price History
- [ ] Cơ chế Versioned Price History: Insert bản ghi mới khi đổi giá, không ghi đè lịch sử.
- [ ] API tra cứu giá có hiệu lực theo ngày: `effective_from <= date` order by `effective_from DESC`.
- [ ] Giao diện xem Tab Lịch sử giá & Lịch sử giá vốn của từng sản phẩm.

### PHASE 6: Inventory Management & Stock Movements
- [ ] Chức năng Nhập kho: Tạo phiếu nhập, tính giá vốn lô nhập, tăng tồn kho, tự động tạo `STOCK_MOVEMENTS` (`PURCHASE`).
- [ ] Chức năng Điều chỉnh / Xuất hủy kho (`DAMAGE`, `LOSS`, `GIFT`, `RETURN`, `ADJUSTMENT`).
- [ ] Sổ cái biến động kho (Thẻ kho chi tiết: Tồn đầu $\rightarrow$ Nhập $\rightarrow$ Xuất $\rightarrow$ Tồn cuối).

### PHASE 7: Fast Sales Recording (Ghi nhận bán hàng <= 5s)
- [ ] Màn hình Ghi nhận bán tối ưu cho Mobile & Desktop: Chọn ngày $\rightarrow$ Tìm kiếm sản phẩm $\rightarrow$ Tự động load giá tại ngày đó $\rightarrow$ Điều chỉnh số lượng $[ - ] [ SL ] [ + ]$ $\rightarrow$ Nhấn [GHI NHẬN].
- [ ] Transaction an toàn tuyệt đối: Kiểm tra tồn $\rightarrow$ Snapshot `unit_price_at_sale` & `cost_price_at_sale` $\rightarrow$ Lưu `sales_records` $\rightarrow$ Trừ kho và tạo `stock_movements` (`SALE`) $\rightarrow$ Cập nhật cached stock. Rollback toàn bộ nếu lỗi.
- [ ] Doanh thu và lợi nhuận được tính snapshot cố định, không thay đổi khi giá hiện tại cập nhật.

### PHASE 8: Real-time Dashboard & Master Aggregate Table
- [ ] Dashboard Summary Cards: Doanh thu, Số lượng bán, Số lượng tồn, Giá trị tồn kho, Lợi nhuận.
- [ ] Bộ lọc thời gian: Hôm nay, Hôm qua, 7 ngày, 30 ngày, Tháng này, Tháng trước, Quý này, Năm nay, Tùy chọn.
- [ ] **Bảng thống kê tổng thể (Master Table)**: `Loại sản phẩm` | `Sản phẩm` | `SL tổng` | `SL nhập` | `SL bán` | `SL tồn` | `Giá nhập` | `Giá bán` | `Giá trị tồn` | `Doanh thu` | `Lợi nhuận`.
- [ ] Hỗ trợ Sort, Search, Filter danh mục, Sticky header, Hàng tổng cuối bảng, Export Excel.

### PHASE 9: Reports & Analytics
- [ ] Báo cáo doanh thu & lợi nhuận theo thời gian (Biểu đồ + Bảng).
- [ ] Báo cáo Top sản phẩm bán chạy / bán chậm.
- [ ] Báo cáo định giá tồn kho & cảnh báo hàng sắp hết.

### PHASE 10: Excel Engine (Import / Update with Preview & Validation)
- [ ] Tải file mẫu chuẩn tiếng Việt cho 4 module: Danh mục, Loại SP, Sản phẩm, Nhập kho.
- [ ] Cơ chế Upload & Validation: Kiểm tra trùng SKU, mã không hợp lệ, số âm, thiếu trường bắt buộc.
- [ ] Màn hình **Excel Preview Diff**: Hiển thị rõ các nhóm (Thêm mới, Cập nhật, Giữ nguyên, Lỗi) trước khi cho phép bấm [XÁC NHẬN CẬP NHẬT].
- [ ] Commit an toàn trong transaction, không ghi đè lịch sử bán/giá.

### PHASE 11: Audit Log & System Security
- [ ] Tự động ghi nhận `audit_logs` cho mọi hành động nhạy cảm (Đổi giá, Điều chỉnh kho, Ghi nhận bán, Import Excel, Deactivate).
- [ ] Bảo mật: Chống SQL Injection, XSS, Excel Formula Injection, Rate limiting và kiểm soát quyền hạn.

### PHASE 12: Automated & Manual Testing Suite
- [ ] Unit & Integration test cho các luồng nghiệp vụ cốt lõi:
  * Bán hàng snapshot giá, trừ tồn, rollback khi thiếu hàng.
  * Lịch sử giá theo ngày không bị ghi đè.
  * Doanh thu lịch sử không thay đổi khi sửa giá bán hiện tại.
  * Thẻ kho tính đúng số dư sau mỗi giao dịch.
  * Excel Preview & Validation phát hiện đúng lỗi.
  * Thống kê Dashboard tính đúng các cột.

### PHASE 13: Production Readiness & Build Verification
- [ ] Build kiểm tra toàn bộ TypeScript và đóng gói ứng dụng.
- [ ] Verification toàn diện quy trình sử dụng thực tế (E2E flow test).

---

## 4. VERIFICATION PLAN

### Automated Tests
- Chạy test suite kiểm thử transaction bán hàng, tra cứu giá theo ngày, tính toán doanh thu/lợi nhuận, và import Excel.
- Build production bundle không có cảnh báo/lỗi type.

### Manual Verification
- Test thực tế trên giao diện:
  1. Đăng nhập Admin & Staff.
  2. Tạo danh mục, loại sản phẩm và sản phẩm mới.
  3. Đổi giá sản phẩm vào 2 ngày khác nhau, ghi nhận bán vào 2 ngày tương ứng $\rightarrow$ Kiểm tra doanh thu mỗi ngày phản ánh đúng giá của ngày đó.
  4. Nhập kho và điều chỉnh kho $\rightarrow$ Kiểm tra biến động thẻ kho và cập nhật tồn.
  5. Xem bảng tổng hợp Dashboard $\rightarrow$ Kiểm tra từng cột khớp 100% với dữ liệu database.
  6. Import file Excel có chứa dòng thêm mới, dòng sửa và dòng lỗi $\rightarrow$ Kiểm tra màn hình Preview hiển thị chính xác và Commit đúng dữ liệu.
