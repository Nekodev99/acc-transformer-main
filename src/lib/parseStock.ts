import { readGrid } from "./parseReport";

/**
 * Parser for the "รายงานยอดสินค้าคงเหลือ (แยกตามคลังและที่เก็บ)" stock-balance
 * report. It is grouped: a group-header row carries the warehouse (คลัง) and
 * location (ที่เก็บ), followed by its product lines, then a "รวม" subtotal.
 * Group-level fields are carried down onto each line; subtotal / grand-total
 * ("รวม…") and title rows are dropped. A snapshot report — no per-row date and
 * no money, only ยอดคงเหลือ (balance, which may be negative). Output matches the
 * hand-corrected "หลัง" tab.
 */

export const STOCK_COLUMNS = [
  "รหัสคลัง",
  "รหัสสินค้า",
  "ชื่อคลัง",
  "ชื่อสินค้า",
  "รหัสที่เก็บ",
  "ชื่อที่เก็บ",
  "หน่วยนับ",
  "ยอดคงเหลือ",
] as const;

export type StockRow = Record<(typeof STOCK_COLUMNS)[number], string | number>;

const S = (v: unknown): string => String(v ?? "").trim();

/** Keep numbers numeric (strip thousands separators); blank stays blank. */
const N = (v: unknown): string | number => {
  const s = S(v);
  if (s === "") return "";
  const f = parseFloat(s.replace(/,/g, ""));
  return Number.isNaN(f) ? s : f;
};

export function parseStock(buffer: ArrayBuffer): StockRow[] {
  const grid = readGrid(buffer);
  if (!grid.some((r) => (r || []).some((c) => S(c).includes("ยอดสินค้าคงเหลือ"))))
    throw new Error("รูปแบบไฟล์ไม่ถูกต้อง: ไม่พบหัวรายงาน 'ยอดสินค้าคงเหลือ'");

  const rows: StockRow[] = [];
  let header: string[] | null = null;

  for (const raw of grid) {
    const cells = (raw || []).map(S);
    while (cells.length < 19) cells.push("");
    const c1 = cells[1]; // warehouse code on group rows; "รวม…" on subtotals
    const code = cells[2]; // product code on line rows

    if (c1.startsWith("รวม")) continue; // subtotal / grand total
    // group header: warehouse code present, no product code
    if (c1 && !code) {
      header = cells;
      continue;
    }
    // product line
    if (code && header) {
      rows.push({
        รหัสคลัง: header[1],
        รหัสสินค้า: code,
        ชื่อคลัง: header[4],
        ชื่อสินค้า: cells[6],
        รหัสที่เก็บ: header[12],
        ชื่อที่เก็บ: header[14],
        หน่วยนับ: cells[15],
        ยอดคงเหลือ: N(cells[18]),
      });
    }
  }

  return rows;
}
