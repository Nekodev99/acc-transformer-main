import * as XLSX from "xlsx";

export type ReportType = "cash" | "credit" | "return";

export const OUTPUT_COLUMNS = [
  "รหัสลูกค้า",
  "ชื่อลูกค้า",
  "วันที่เอกสาร",
  "เลขที่ใบกำกับ",
  "รหัสสินค้า",
  "ชื่อสินค้า",
  "จำนวน",
  "หน่วยนับ",
  "ราคา/หน่วย",
  "เงินก่อนภาษี",
  "ภาษีขาย",
  "จำนวนเงิน",
  "รวมทั้งสิ้น",
] as const;

export type OutputRow = Record<(typeof OUTPUT_COLUMNS)[number], string | number>;

export interface ParseResult {
  type: ReportType;
  rows: OutputRow[];
  invoiceCount: number;
}

const HEADER_SCAN = 14;
type Cell = string | number;
type Grid = Cell[][];

const norm = (s: unknown): string => String(s ?? "").replace(/\s+/g, " ").trim();
const isDate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(v.trim());

/**
 * Read a workbook into a 2D grid.
 *
 * The Thai ERP exports its cash-sales report as a normal named sheet, but the
 * credit-sales and return reports land in the file's "Preamble" pseudo-sheet
 * (the rows live outside a committed BoundSheet). Fall back to Preamble when the
 * first named sheet has no usable range.
 */
export function readGrid(buffer: ArrayBuffer): Grid {
  const wb = XLSX.read(buffer, { type: "array" });
  let ws = wb.Sheets[wb.SheetNames[0]];
  // @ts-expect-error Preamble is an internal SheetJS field, not in the types
  if (!ws || !ws["!ref"]) ws = wb.Preamble as XLSX.WorkSheet;
  if (!ws || !ws["!ref"]) throw new Error("ไม่พบข้อมูลในไฟล์ ( no usable sheet)");
  return XLSX.utils.sheet_to_json<Cell[]>(ws, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: true,
  });
}

function findCol(rows: Grid, rowIdx: number, label: string): number {
  const r = rows[rowIdx];
  if (!r) return -1;
  for (let c = 0; c < r.length; c++) if (norm(r[c]) === label) return c;
  return -1;
}
function findRowWith(rows: Grid, label: string): number {
  for (let i = 0; i < Math.min(HEADER_SCAN, rows.length); i++)
    if ((rows[i] || []).some((c) => norm(c) === label)) return i;
  return -1;
}
function findColAnywhere(rows: Grid, label: string, excludeRow: number): number {
  for (let i = 0; i < Math.min(HEADER_SCAN, rows.length); i++) {
    if (i === excludeRow) continue;
    const r = rows[i] || [];
    for (let c = 0; c < r.length; c++) if (norm(r[c]) === label) return c;
  }
  return -1;
}

interface ColMap {
  custCode: number;
  custName: number;
  prodCode: number;
  prodName: number;
  qty: number;
  unit: number;
  price: number;
  lineAmount: number;
  date: number;
  invoice: number;
  preTax: number;
  tax: number;
  grand: number;
}

/**
 * The three report types share the same row shape but place columns at
 * different indices (credit adds credit-term columns, returns add original-
 * invoice columns). So resolve every column by its header label rather than a
 * fixed index. Product-level fields live on the "รหัสสินค้า" header row;
 * document-level fields live elsewhere in the header band.
 */
function buildMap(rows: Grid): { map: ColMap; dataStart: number } {
  const custRow = findRowWith(rows, "รหัสลูกค้า");
  const prodRow = findRowWith(rows, "รหัสสินค้า");
  if (prodRow < 0)
    throw new Error("รูปแบบไฟล์ไม่ถูกต้อง: ไม่พบหัวตาราง 'รหัสสินค้า'");
  const map: ColMap = {
    custCode: findCol(rows, custRow, "รหัสลูกค้า"),
    custName: findCol(rows, custRow, "ชื่อลูกค้า"),
    prodCode: findCol(rows, prodRow, "รหัสสินค้า"),
    prodName: findCol(rows, prodRow, "ชื่อสินค้า"),
    qty: findCol(rows, prodRow, "จำนวน"),
    unit: findCol(rows, prodRow, "หน่วยนับ"),
    price: findCol(rows, prodRow, "ราคา/หน่วย"),
    lineAmount: findCol(rows, prodRow, "จำนวนเงิน"),
    date: findColAnywhere(rows, "วันที่เอกสาร", prodRow),
    invoice: findColAnywhere(rows, "เลขที่ใบกำกับ", prodRow),
    preTax: findColAnywhere(rows, "เงินก่อนภาษี", prodRow),
    tax: findColAnywhere(rows, "ภาษีขาย", prodRow),
    grand: findColAnywhere(rows, "รวมทั้งสิ้น", prodRow),
  };
  return { map, dataStart: prodRow + 1 };
}

function detectType(rows: Grid): ReportType {
  const txt = rows
    .slice(0, 6)
    .flat()
    .map(norm)
    .join(" ");
  if (txt.includes("รับคืน") || txt.includes("ลดหนี้")) return "return";
  if (txt.includes("ขายเชื่อ")) return "credit";
  return "cash";
}

export function parseReport(
  buffer: ArrayBuffer,
  forcedType?: ReportType
): ParseResult {
  const rows = readGrid(buffer);
  const type = forcedType ?? detectType(rows);
  const { map, dataStart } = buildMap(rows);

  // Returns/credit-notes reduce sales, so the cleaned report negates every
  // numeric field; missing VAT on a return line is shown as 0 (not blank).
  const neg = type === "return";
  const sign = (v: Cell): Cell => (typeof v === "number" && neg ? -v : v);
  const taxOut = (v: Cell): Cell => (neg ? (v === "" ? 0 : sign(v)) : v);

  const out: OutputRow[] = [];
  let cust = { code: "" as Cell, name: "" as Cell };
  let doc = { date: "" as Cell, invoice: "" as Cell };
  let pending = { preTax: "" as Cell, tax: "" as Cell, grand: "" as Cell };
  let firstLine = false;
  const invoices = new Set<string>();

  for (let i = dataStart; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const g = (c: number): Cell => (c >= 0 && c < r.length ? r[c] : "");
    const cc = g(map.custCode);
    const dt = g(map.date);
    const pc = g(map.prodCode);

    if (norm(cc) === "รวม") continue; // subtotal / grand-total rows
    if (cc !== "" && dt === "" && pc === "") {
      cust = { code: cc, name: g(map.custName) }; // customer header
      continue;
    }
    if (isDate(dt)) {
      doc = { date: dt.trim(), invoice: g(map.invoice) }; // document header
      pending = { preTax: g(map.preTax), tax: g(map.tax), grand: g(map.grand) };
      firstLine = true;
      if (doc.invoice) invoices.add(String(doc.invoice));
      continue;
    }
    if (pc !== "") {
      // product line — document totals attach only to the invoice's first line
      out.push({
        รหัสลูกค้า: cust.code,
        ชื่อลูกค้า: cust.name,
        วันที่เอกสาร: doc.date,
        เลขที่ใบกำกับ: doc.invoice,
        รหัสสินค้า: pc,
        ชื่อสินค้า: g(map.prodName),
        จำนวน: sign(g(map.qty)),
        หน่วยนับ: g(map.unit),
        "ราคา/หน่วย": sign(g(map.price)),
        เงินก่อนภาษี: firstLine ? sign(pending.preTax) : "",
        ภาษีขาย: firstLine ? taxOut(pending.tax) : "",
        จำนวนเงิน: sign(g(map.lineAmount)),
        รวมทั้งสิ้น: firstLine ? sign(pending.grand) : "",
      });
      firstLine = false;
      continue;
    }
    // amounts-only row (returns put document totals on a row of their own)
    const p = g(map.preTax);
    const gr = g(map.grand);
    if (p !== "" || gr !== "")
      pending = { preTax: p, tax: g(map.tax), grand: gr };
  }

  return { type, rows: out, invoiceCount: invoices.size };
}

export const TYPE_LABELS: Record<ReportType, string> = {
  cash: "รายงานขายสด",
  credit: "รายงานขายเชื่อ",
  return: "รายงานรับคืน / ลดหนี้",
};
