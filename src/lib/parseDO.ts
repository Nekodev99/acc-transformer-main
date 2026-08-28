import { readGrid } from "./parseReport";

/**
 * Parser for the "รายงานรับสินค้าเข้า (DO)" goods-receipt report. Like the
 * purchase report it is a fixed-index ERP export, but its header spans two rows
 * (document-level labels on one, product-line labels on the next) and the body
 * interleaves one document header row with its product lines. Document-level
 * fields (date, doc no, doc type, creditor) are carried down onto each line;
 * "รวม / รวมประจำวัน / รวมทั้งสิ้น" subtotal rows are dropped. Output matches the
 * hand-corrected "หลัง" tab. No money on this report — only จำนวน (quantity).
 */

export const DO_COLUMNS = [
  "วันที่เอกสาร",
  "รหัสสินค้า",
  "เลขที่เอกสาร",
  "ชื่อสินค้า",
  "รายการเอกสาร",
  "เลขที่ใบ PO",
  "Approve PO",
  "ชื่อเจ้าหนี้",
  "คลัง",
  "ที่เก็บ",
  "หน่วยนับ",
  "จำนวน",
] as const;

export type DORow = Record<(typeof DO_COLUMNS)[number], string | number>;

export interface DOResult {
  rows: DORow[];
  docCount: number;
}

const S = (v: unknown): string => String(v ?? "").trim();

/** Keep numbers numeric (strip thousands separators); blank stays blank. */
const N = (v: unknown): string | number => {
  const s = S(v);
  if (s === "") return "";
  const f = parseFloat(s.replace(/,/g, ""));
  return Number.isNaN(f) ? s : f;
};

export function parseDO(buffer: ArrayBuffer): DOResult {
  const grid = readGrid(buffer);
  if (!grid.some((r) => (r || []).some((c) => S(c) === "รหัสสินค้า")))
    throw new Error("รูปแบบไฟล์ไม่ถูกต้อง: ไม่พบหัวตาราง 'รหัสสินค้า' (ไฟล์รายงานรับสินค้า DO?)");

  const rows: DORow[] = [];
  const docs = new Set<string>();
  let header: string[] | null = null;

  for (const raw of grid) {
    const cells = (raw || []).map(S);
    while (cells.length < 25) cells.push("");
    const date = cells[1];
    const code = cells[2];

    // document header row: real date (dd/mm/yyyy) in the date column
    if (date && date !== "วันที่เอกสาร" && date.includes("/")) {
      header = cells;
      if (cells[3]) docs.add(cells[3]);
      continue;
    }
    // product line: a real code that isn't the header label or a subtotal
    if (code && code !== "รหัสสินค้า" && !code.startsWith("รวม") && header) {
      rows.push({
        วันที่เอกสาร: header[1],
        รหัสสินค้า: code,
        เลขที่เอกสาร: header[3],
        ชื่อสินค้า: cells[6],
        รายการเอกสาร: header[8],
        "เลขที่ใบ PO": cells[11],
        "Approve PO": cells[13],
        ชื่อเจ้าหนี้: header[15],
        คลัง: cells[17],
        ที่เก็บ: cells[18],
        หน่วยนับ: cells[19],
        จำนวน: N(cells[24]),
      });
    }
  }

  return { rows, docCount: docs.size };
}
