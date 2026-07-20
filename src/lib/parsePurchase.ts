import { readGrid } from "./parseReport";

/**
 * Parser for the "รายงานซื้อเชื่อ" (credit-purchase) report — a TypeScript port
 * of the original Python `convert.py`. Unlike the sales report (which maps
 * columns by header label), this ERP export places purchase columns at fixed
 * indices, so we read them by index. The broken BOUNDSHEET offset that made the
 * Python side byte-patch the file is handled for us: SheetJS drops the rows into
 * the workbook "Preamble", which `readGrid` already falls back to.
 */

export const PURCHASE_COLUMNS = [
  "วันที่เอกสาร",
  "รหัสสินค้า",
  "หมวด",
  "ชื่อสินค้า",
  "ชื่อผู้ขาย",
  "เลขที่ใบกำกับ",
  "จำนวน",
  "หน่วยนับ",
  "ราคา/หน่วย",
  "เงินก่อนภาษี",
  "ภาษีซื้อ",
  "รวมทั้งสิ้น",
] as const;

export type PurchaseRow = Record<(typeof PURCHASE_COLUMNS)[number], string | number>;

export interface PurchaseResult {
  rows: PurchaseRow[];
  invoiceCount: number;
}

type Cell = string | number;

const S = (v: unknown): string => String(v ?? "").trim();

/** Keep numbers numeric (strip thousands separators); blank stays blank. */
const N = (v: unknown): Cell => {
  const s = S(v);
  if (s === "") return "";
  const f = parseFloat(s.replace(/,/g, ""));
  return Number.isNaN(f) ? String(v) : f;
};

export function parsePurchase(buffer: ArrayBuffer): PurchaseResult {
  const grid = readGrid(buffer);
  if (!grid.some((r) => (r || []).some((c) => S(c) === "รหัสสินค้า")))
    throw new Error("รูปแบบไฟล์ไม่ถูกต้อง: ไม่พบหัวตาราง 'รหัสสินค้า' (ไฟล์รายงานซื้อเชื่อ?)");

  const rows: PurchaseRow[] = [];
  const invoices = new Set<string>();
  let header: string[] | null = null;
  let firstOfDoc = false;

  for (const raw of grid) {
    const cells = (raw || []).map(S);
    while (cells.length < 34) cells.push("");
    const date = cells[1];
    const code = cells[2];

    // document header row: has a real date in the date column
    if (date && date !== "วันที่เอกสาร" && date.includes("/")) {
      header = cells;
      firstOfDoc = true;
      if (cells[10]) invoices.add(cells[10]);
      continue;
    }
    // product line: has a product code and belongs to a known document
    if (code && code !== "รหัสสินค้า" && header) {
      rows.push({
        วันที่เอกสาร: header[1],
        รหัสสินค้า: code,
        หมวด: "", // เว้นว่างโดยตั้งใจ — ไฟล์ดิบไม่มีหมวด ให้ฝ่ายบัญชีเติมเอง
        ชื่อสินค้า: cells[9],
        ชื่อผู้ขาย: header[19],
        เลขที่ใบกำกับ: header[10],
        จำนวน: N(cells[21]),
        หน่วยนับ: cells[23],
        "ราคา/หน่วย": N(cells[26]),
        เงินก่อนภาษี: N(cells[31]),
        // ภาษีซื้อ/รวมทั้งสิ้น เป็นยอดของทั้งใบกำกับ ลงเฉพาะบรรทัดแรกของใบ
        ภาษีซื้อ: firstOfDoc ? N(header[32]) : "",
        รวมทั้งสิ้น: firstOfDoc ? N(header[33]) : "",
      });
      firstOfDoc = false;
    }
  }

  return { rows, invoiceCount: invoices.size };
}
