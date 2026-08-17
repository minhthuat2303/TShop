import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

interface Props {
  params: Promise<{ type: string }>;
}

export async function GET(request: NextRequest, props: Props) {
  try {
    const { type } = await props.params;

    const workbook = XLSX.utils.book_new();
    let fileName = 'Mau_nhap_lieu.xlsx';
    let data: any[] = [];

    if (type === 'categories') {
      fileName = 'Mau_Danh_Muc.xlsx';
      data = [
        {
          'Mã danh mục (*)': 'GB',
          'Tên danh mục (*)': 'Gấu bông',
          'Mô tả': 'Các loại thú nhồi bông mềm cao cấp',
        },
        {
          'Mã danh mục (*)': 'XE',
          'Tên danh mục (*)': 'Xe đồ chơi',
          'Mô tả': 'Xe điều khiển từ xa, xe mô hình kim loại',
        },
      ];
    } else if (type === 'product_types') {
      fileName = 'Mau_Loai_San_Pham.xlsx';
      data = [
        {
          'Mã danh mục (*)': 'GB',
          'Mã loại SP (*)': 'CAPYBARA',
          'Tên loại SP (*)': 'Gấu Capybara',
          'Mô tả': 'Gấu bông capybara các kích cỡ',
        },
        {
          'Mã danh mục (*)': 'XE',
          'Mã loại SP (*)': 'RC_CAR',
          'Tên loại SP (*)': 'Xe điều khiển RC',
          'Mô tả': 'Xe địa hình điều khiển',
        },
      ];
    } else if (type === 'products') {
      fileName = 'Mau_San_Pham.xlsx';
      data = [
        {
          'Mã SKU (*)': 'GB010',
          'Tên sản phẩm (*)': 'Gấu Bông Capybara Hồng Đeo Nơ 45cm',
          'Mã danh mục (*)': 'GB',
          'Mã loại SP (*)': 'CAPYBARA',
          'Giá nhập hiện tại': 110000,
          'Giá bán hiện tại': 195000,
          'Số lượng tồn': 25,
          'Ngưỡng cảnh báo tồn': 5,
        },
        {
          'Mã SKU (*)': 'XE010',
          'Tên sản phẩm (*)': 'Xe Đua Drift Siêu Tốc Độ 1:16',
          'Mã danh mục (*)': 'XE',
          'Mã loại SP (*)': 'RC_CAR',
          'Giá nhập hiện tại': 210000,
          'Giá bán hiện tại': 360000,
          'Số lượng tồn': 15,
          'Ngưỡng cảnh báo tồn': 4,
        },
      ];
    } else if (type === 'imports') {
      fileName = 'Mau_Nhap_Kho.xlsx';
      data = [
        {
          'Mã SKU (*)': 'GB001',
          'Ngày nhập (YYYY-MM-DD) (*)': '2026-08-17',
          'Số lượng nhập (*)': 20,
          'Giá nhập thực tế (*)': 95000,
          'Ghi chú': 'Nhập bổ sung lô hàng hè',
        },
      ];
    } else {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_TYPE', message: 'Loại biểu mẫu không hợp lệ.' } },
        { status: 400 }
      );
    }

    const worksheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Dữ liệu');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
