# ĐẶC TẢ API KIẾN TRÚC (API.MD)
**T_SHOP RESTful API Specifications**

---

## 1. TIÊU CHUẨN THIẾT KẾ API (CONVENTIONS)

* **Base URL**: `/api`
* **Content-Type**: `application/json; charset=utf-8` (hoặc `multipart/form-data` khi tải Excel)
* **Auth**: Header `Authorization: Bearer <token>` hoặc Cookie Session
* **Response Format**:
```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 120,
    "totalPages": 6
  }
}
```
* **Error Format**:
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Số lượng tồn kho không đủ để ghi nhận bán (Tồn hiện tại: 3, Yêu cầu: 5).",
    "details": []
  }
}
```

---

## 2. DANH SÁCH ENDPOINTS CHI TIẾT

### 2.1. Authentication (`/api/auth`)
* `POST /api/auth/login`: Đăng nhập username/password $\rightarrow$ Trả về user info & token.
* `POST /api/auth/logout`: Đăng xuất.
* `GET /api/auth/me`: Lấy thông tin user hiện tại và quyền hạn.

### 2.2. Categories & Product Types (`/api/categories`, `/api/product-types`)
* `GET /api/categories`: Lấy danh sách danh mục (kèm số lượng loại & sản phẩm).
* `POST /api/categories`: Tạo danh mục mới (Admin).
* `PUT /api/categories/:id`: Sửa thông tin danh mục.
* `DELETE /api/categories/:id`: Xóa danh mục (Chỉ cho phép nếu không có sản phẩm/loại liên kết).
* `GET /api/product-types`: Lấy danh sách loại sản phẩm (hỗ trợ filter theo `category_id`).
* `POST /api/product-types`: Tạo loại sản phẩm mới.
* `PUT /api/product-types/:id`: Sửa loại sản phẩm.
* `DELETE /api/product-types/:id`: Xóa loại sản phẩm (Chỉ khi không có sản phẩm liên kết).

### 2.3. Products (`/api/products`)
* `GET /api/products`: Danh sách sản phẩm với Search (`q` = tên/SKU), Filter (`category_id`, `product_type_id`, `status`), Sort, Pagination.
* `GET /api/products/:id`: Chi tiết sản phẩm.
* `POST /api/products`: Tạo mới sản phẩm (Tự động khởi tạo giá ban đầu vào `price_history` & `cost_price_history`).
* `PUT /api/products/:id`: Cập nhật thông tin cơ bản của sản phẩm.
* `PATCH /api/products/:id/status`: Bật/Tắt trạng thái bán (`ACTIVE` / `INACTIVE`).
* `GET /api/products/:id/price-history`: Lấy lịch sử giá bán.
* `POST /api/products/:id/price-history`: Thêm mức giá bán mới có hiệu lực từ ngày `effective_from`.
* `GET /api/products/:id/cost-history`: Lịch sử giá vốn.
* `GET /api/products/:id/sales-history`: Lịch sử bán hàng của sản phẩm.
* `GET /api/products/:id/stock-history`: Lịch sử biến động kho của sản phẩm.

### 2.4. Sales Recording (`/api/sales`)
* `GET /api/sales/resolve-price?productId=12&date=2026-08-17`: Lấy giá bán áp dụng cho sản phẩm tại ngày cụ thể (<= 5s flow).
* `POST /api/sales`: Ghi nhận bán sản phẩm:
  * **Payload**:
    ```json
    {
      "productId": 12,
      "saleDate": "2026-08-17",
      "quantity": 2,
      "note": "Khách mua tại quầy"
    }
    ```
  * **Transaction Execution**:
    1. Kiểm tra sản phẩm tồn tại và đang `ACTIVE`.
    2. Kiểm tra tồn kho đủ số lượng.
    3. Xác định `unit_price_at_sale` theo `saleDate` từ `price_history`.
    4. Xác định `cost_price_at_sale` theo `saleDate` từ `cost_price_history`.
    5. Lưu bản ghi `sales_records` với doanh thu và lợi nhuận tính theo snapshot.
    6. Tạo bản ghi `stock_movements` (type = `SALE`, quantity = `-quantity`).
    7. Cập nhật `current_stock` sản phẩm.
    8. Ghi log `audit_logs`.
    9. Commit transaction $\rightarrow$ Trả về kết quả thành công.
* `GET /api/sales`: Danh sách các giao dịch bán đã ghi nhận (Filter theo ngày, sản phẩm, nhân viên).

### 2.5. Inventory Management (`/api/inventory`)
* `GET /api/inventory`: Bảng theo dõi tồn kho hiện tại và cảnh báo tồn tối thiểu.
* `POST /api/inventory/receipts`: Nhập kho (Tạo phiếu nhập, tăng tồn, ghi nhận giá vốn lô hàng, tạo `stock_movements`).
* `POST /api/inventory/adjustments`: Điều chỉnh kho / xuất hủy / mất / mẫu (`DAMAGE`, `LOSS`, `GIFT`, `RETURN`, `ADJUSTMENT`).
* `GET /api/inventory/movements`: Báo cáo chi tiết lịch sử thẻ kho (Stock Movements Ledger).

### 2.6. Dashboard Aggregation (`/api/dashboard`)
* `GET /api/dashboard/summary?dateRange=this_month&startDate=&endDate=`:
  * Trả về: Tổng doanh thu, tổng số lượng bán, tổng số lượng tồn, tổng giá trị tồn kho, tổng lợi nhuận trong kỳ.
* `GET /api/dashboard/aggregate-table?dateRange=this_month&categoryId=&productTypeId=&q=&page=1&limit=20`:
  * Trả về bảng tổng hợp Master Table theo đúng yêu cầu:
  * Cột: `Loại sản phẩm`, `Sản phẩm`, `SL tổng`, `SL nhập`, `SL bán`, `SL tồn`, `Giá nhập`, `Giá bán`, `Giá trị tồn`, `Doanh thu`, `Lợi nhuận`.
  * Hỗ trợ sort, filter, pagination, tổng footer.
* `GET /api/dashboard/export-excel?dateRange=...`: Tải file Excel báo cáo tổng thể.

### 2.7. Reports (`/api/reports`)
* `GET /api/reports/sales-by-date`: Doanh thu & lợi nhuận theo ngày/tháng/năm.
* `GET /api/reports/top-selling`: Top sản phẩm bán chạy nhất / bán chậm nhất.
* `GET /api/reports/inventory-valuation`: Báo cáo định giá tồn kho và cảnh báo tồn ít.

### 2.8. Excel Import / Update (`/api/excel`)
* `GET /api/excel/templates/:type`: Tải file mẫu Excel chuẩn tiếng Việt (`categories`, `product_types`, `products`, `imports`).
* `POST /api/excel/preview`: Upload file Excel để kiểm tra và sinh bản Preview (Phân loại: Thêm mới, Cập nhật, Giữ nguyên, Lỗi validation).
* `POST /api/excel/commit`: Xác nhận áp dụng dữ liệu hợp lệ vào Database (thực thi trong transaction).

### 2.9. Audit Logs (`/api/audit-logs`)
* `GET /api/audit-logs`: Danh sách lịch sử thao tác hệ thống (Admin).
