# T_SHOP — HỆ THỐNG QUẢN LÝ SHOP ĐỒ CHƠI TRẺ EM

Hệ thống quản lý bán hàng, sản phẩm, kho và thống kê cho shop đồ chơi đã được nâng cấp và hoàn thiện toàn diện:

---

## 1. CÁC TÍNH NĂNG MỚI HOÀN THÀNH

### 1. Giao diện Sidebar Tối Giản & Sang Trọng (Clean Light Theme)
* **Loại bỏ màu nền tối**: Thay thế toàn bộ khung nền xanh đen đậm (`#0f172a`) của Sidebar sang nền trắng tinh tế (`#ffffff`) viền xám mờ (`#e2e8f0`), hòa nhập liền mạch với thanh Header và bố cục trang web.
* **Logo & Tiêu đề**: `T_SHOP RETAIL` màu đen xám hiện đại (`#0f172a`) kèm huy hiệu `PRO` phong cách trung tính.
* **Menu điều hướng**:
  * Mục đang chọn (Active) nổi bật với nền than chì sang trọng (`#0f172a`) và chữ trắng.
  * Các mục chưa chọn hiển thị chữ xám đậm thanh lịch (`#475569`), hover nhẹ nhàng (`#f1f5f9`).
* **Chân trang người dùng**: Thông tin tài khoản người dùng hiển thị sắc nét, tối giản.

### 2. Nâng cấp Bảng Lịch sử Bán hàng (`/sales/new` & `/api/sales`)
* **Bộ lọc ngày linh hoạt**: Bổ sung bộ chọn ngày `Từ ngày` - `Đến ngày` để tra cứu lịch sử bán hàng theo khoảng thời gian bất kỳ (mặc định hiển thị ngày hiện tại).
* **Tìm kiếm đa năng**: Ô tìm kiếm hỗ trợ tra cứu theo Mã giao dịch (`TX-...`), Mã SKU, Tên sản phẩm, hoặc Ghi chú.
* **Bộ lọc trạng thái & Phân trang**:
  * Lọc theo trạng thái: *Tất cả*, *Thành công*, hoặc *Đã hủy*.
  * Tùy chọn số lượng hiển thị: 10, 20, 50, 100 dòng/trang (mặc định 10 dòng mới nhất).
  * Bộ điều hướng phân trang: Trang `Trước` / `Sau` kèm tổng số bản ghi.
* **Xuất file Excel chi tiết lịch sử bán (`/api/sales/export-excel`)**:
  * Nút bấm **[Xuất file lịch sử bán]** màu xanh lá.
  * Xuất toàn bộ các cột: Mã GD, Ngày bán, SKU, Tên SP, Danh mục, Loại SP, Số lượng, Đơn giá, Giảm giá, Doanh thu, Giá vốn, Lợi nhuận, Trạng thái, Người bán, Lý do hủy, Ghi chú.
  * Tự động áp dụng mã định dạng số `cell.z = '#,##0'` cho các ô tiền tệ và số lượng.

### 3. Thiết kế Giao diện Tab & Danh mục Tối giản, Trung tính
* Toàn bộ thanh phân tab trên các trang **Quản lý kho**, **Sản phẩm**, **Bán hàng** đã được chuẩn hóa sang phong cách Segmented Tabs trung tính.

---

## 2. KẾT QUẢ KIỂM THỬ THỰC TẾ (VERIFICATION RESULTS)

* **Automated Test Suite**: **24/24 tests PASS 100%** qua [test-runner.mjs](file:///d:/project/T_SHOP/scripts/test-runner.mjs).
* **Next.js Production Build**: `npm run build` thành công xuất sắc, biên dịch sạch 39 routes.
* **Video phiên tương tác thực tế**: [tshop_light_minimalist_sidebar_demo_1786960692116.webp](file:///C:/Users/thuatnm/.gemini/antigravity-ide/brain/a5da016f-29e2-48b7-9a60-729470432276/tshop_light_minimalist_sidebar_demo_1786960692116.webp)
* **Ảnh chụp màn hình thực tế**:
  * Dashboard: [dashboard_sidebar_1786960701146.png](file:///C:/Users/thuatnm/.gemini/antigravity-ide/brain/a5da016f-29e2-48b7-9a60-729470432276/dashboard_sidebar_1786960701146.png)
  * Ghi nhận bán: [sales_sidebar_1786960710296.png](file:///C:/Users/thuatnm/.gemini/antigravity-ide/brain/a5da016f-29e2-48b7-9a60-729470432276/sales_sidebar_1786960710296.png)
  * Quản lý kho: [inventory_sidebar_1786960723157.png](file:///C:/Users/thuatnm/.gemini/antigravity-ide/brain/a5da016f-29e2-48b7-9a60-729470432276/inventory_sidebar_1786960723157.png)
  * Sản phẩm: [products_sidebar_1786960736715.png](file:///C:/Users/thuatnm/.gemini/antigravity-ide/brain/a5da016f-29e2-48b7-9a60-729470432276/products_sidebar_1786960736715.png)
