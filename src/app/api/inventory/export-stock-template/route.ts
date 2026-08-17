import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const products = db.prepare(`
      SELECT 
        p.id, p.sku, p.name, p.current_stock, p.current_cost_price,
        c.name as category_name,
        pt.name as product_type_name
      FROM products p
      JOIN categories c ON c.id = p.category_id
      JOIN product_types pt ON pt.id = p.product_type_id
      WHERE p.status = 'ACTIVE'
      ORDER BY c.name ASC, pt.name ASC, p.name ASC
    `).all() as any[];

    const excelData = products.map((p) => ({
      'Mã SKU (*)': p.sku,
      'Tên sản phẩm': p.name,
      'Danh mục': p.category_name,
      'Loại SP': p.product_type_name,
      'Tồn kho hiện tại': Number(p.current_stock),
      'Giá nhập hiện tại': Number(p.current_cost_price),
      'Số lượng nhập kho (*)': '', // Empty for user to fill
      'Giá nhập mới (nếu đổi)': '', // Optional override
      'Ghi chú': '', // Optional note
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Apply number formatting
    for (const cellKey of Object.keys(worksheet)) {
      if (cellKey.startsWith('!')) continue;
      const cell = worksheet[cellKey];
      if (cell && cell.t === 'n') {
        cell.z = '#,##0';
      }
    }

    worksheet['!cols'] = [
      { wch: 15 },
      { wch: 32 },
      { wch: 18 },
      { wch: 18 },
      { wch: 16 },
      { wch: 18 },
      { wch: 22 },
      { wch: 22 },
      { wch: 25 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Danh sách nhập kho');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const uint8 = new Uint8Array(buffer);
    const today = new Date().toISOString().split('T')[0];

    return new Response(uint8, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Danh_sach_ton_kho_nhap_hang_${today}.xlsx"`,
        'Content-Length': uint8.length.toString(),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: { code: 'EXPORT_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
