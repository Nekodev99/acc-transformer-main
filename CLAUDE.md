@AGENTS.md

# acc-transformer — แปลงรายงาน ACC → ตารางข้อมูล

เว็บแอป Next.js (App Router, static export) แปลงรายงานจากระบบบัญชี ERP ให้เป็นตารางแบน
พร้อมสรุป/กราฟ/ดาวน์โหลด Excel — **ประมวลผลในเบราว์เซอร์ทั้งหมด ไม่มี backend** (deploy เป็น
static บน Vercel, ไม่มี env vars)

## สองโหมด (ปุ่มสลับบนสุด)

- **รายงานขาย** — ขายสด / ขายเชื่อ / รับคืน-ลดหนี้ (map คอลัมน์จาก *ข้อความหัวตาราง*)
- **รายงานซื้อเชื่อ** — พอร์ตมาจากแอป Python เดิม `D:\Project - ACC` (parse ด้วย *fixed index*)

แต่ละโหมดทำได้: แปลง → พรีวิว → สรุปตามลูกค้า/ผู้ขาย + ตามสินค้า + กราฟรายวัน → ดาวน์โหลด Excel 4 ชีต

## โครงไฟล์

```
src/lib/parseReport.ts      parser ฝั่งขาย + readGrid() (อ่าน .xls, fallback ไป Preamble)
src/lib/parsePurchase.ts    parser ฝั่งซื้อ (port convert.py, ใช้ readGrid ร่วม)
src/lib/aggregate.ts        สรุปลูกค้า/ผู้ขาย/สินค้า/รายวัน (dailySales รับ amountKey)
src/lib/exportExcel.ts      exportWorkbook (ขาย) / exportPurchaseWorkbook (ซื้อ)
src/components/PurchaseApp.tsx  หน้าจอฝั่งซื้อ
src/components/ui.tsx           component ใช้ร่วม 2 โหมด
src/components/DailyChart.tsx   กราฟแท่ง SVG (ใช้ร่วม)
src/app/page.tsx               ปุ่มสลับโหมด + SaleApp (ฝั่งขายอยู่ในนี้)
```

## เรื่องที่ต้องรู้ก่อนแก้

- **patch SheetJS สำคัญ** (`patches/xlsx+0.18.5.patch`) — normalize number format `###,###,###,##0`
  ที่ไม่งั้น SheetJS จะ throw ทั้ง sheet. apply อัตโนมัติผ่าน `postinstall` (รวมตอน build บน Vercel)
- **ไฟล์ขาย/ซื้อ เสียคนละแบบ** — ขาย: number format; ซื้อ: BOUNDSHEET offset ผิด → SheetJS ทิ้งแถว
  ลงใน `wb.Preamble` ซึ่ง `readGrid()` fallback ไปอ่านให้อยู่แล้ว **จึงไม่ต้อง port การแก้ไบต์จาก Python**
- **ฝั่งซื้อ:** ภาษีซื้อ/รวมทั้งสิ้น เป็นยอดของทั้งใบ ลงเฉพาะบรรทัดแรก; ยอดต่อบรรทัด = `เงินก่อนภาษี`;
  คอลัมน์ **"หมวด" เว้นว่างโดยตั้งใจ** (ไฟล์ดิบไม่มี ให้บัญชีเติมเอง) — อย่า auto-fill โดยไม่ถาม
- **ฝั่งขาย:** ยอดระดับเอกสารลงเฉพาะบรรทัดสินค้าแรก; รับคืน/ลดหนี้ = ติดลบทุกค่า
- ไฟล์ตัวอย่าง `- ก่อน.xls` / `- หลัง.xlsx` เป็นข้อมูลจริงของบริษัท (ไม่ขึ้น git); ไฟล์ "หลัง" ฝ่ายบัญชี
  แก้มือหลังแปลง จึงไม่ใช่ ground truth เป๊ะ ๆ

## ตรวจงาน

```bash
npm run dev        # http://localhost:3000
npx tsc --noEmit   # type check
```

แอป Python เดิม `D:\Project - ACC` (Vercel `acc-purchase-report`) ยังอยู่ — รอ deploy ตัวนี้แล้วค่อยปลด
