import { OutputRow } from "./parseReport";
import { PurchaseRow } from "./parsePurchase";

const num = (v: string | number): number => (typeof v === "number" ? v : 0);
const round = (n: number): number => Math.round(n * 1e6) / 1e6;

/** Sortable numeric key from a "DD/MM/YYYY" date (Buddhist year ok — ordering is consistent). */
export function dateKey(d: string): number {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(d).trim());
  if (!m) return 0;
  return Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]);
}

/* ----------------------------- by customer ----------------------------- */

export const SUMMARY_COLUMNS = [
  "รหัสลูกค้า",
  "ชื่อลูกค้า",
  "จำนวนใบเอกสาร",
  "จำนวนรายการ",
  "ยอดรวมสินค้า",
  "เงินก่อนภาษี",
  "ภาษีขาย",
  "รวมทั้งสิ้น",
] as const;

export type SummaryRow = Record<(typeof SUMMARY_COLUMNS)[number], string | number>;

/**
 * One row per customer. เงินก่อนภาษี / ภาษีขาย / รวมทั้งสิ้น live only on each
 * invoice's first product line, so summing across rows gives correct totals.
 * Returns carry negative values, so a merged dataset nets sales vs returns.
 */
export function summarizeByCustomer(rows: OutputRow[]): SummaryRow[] {
  const map = new Map<
    string,
    {
      code: string;
      name: string;
      invoices: Set<string>;
      lines: number;
      lineSum: number;
      preTax: number;
      tax: number;
      grand: number;
    }
  >();

  for (const r of rows) {
    const code = String(r["รหัสลูกค้า"] ?? "");
    const name = String(r["ชื่อลูกค้า"] ?? "");
    const key = `${code} ${name}`;
    let a = map.get(key);
    if (!a) {
      a = { code, name, invoices: new Set(), lines: 0, lineSum: 0, preTax: 0, tax: 0, grand: 0 };
      map.set(key, a);
    }
    a.lines += 1;
    const inv = String(r["เลขที่ใบกำกับ"] ?? "");
    if (inv) a.invoices.add(inv);
    a.lineSum += num(r["จำนวนเงิน"]);
    a.preTax += num(r["เงินก่อนภาษี"]);
    a.tax += num(r["ภาษีขาย"]);
    a.grand += num(r["รวมทั้งสิ้น"]);
  }

  return [...map.values()]
    .sort((x, y) => x.code.localeCompare(y.code, "th"))
    .map((a) => ({
      รหัสลูกค้า: a.code,
      ชื่อลูกค้า: a.name,
      จำนวนใบเอกสาร: a.invoices.size,
      จำนวนรายการ: a.lines,
      ยอดรวมสินค้า: round(a.lineSum),
      เงินก่อนภาษี: round(a.preTax),
      ภาษีขาย: round(a.tax),
      รวมทั้งสิ้น: round(a.grand),
    }));
}

/* ------------------------------ by product ------------------------------ */

export const PRODUCT_COLUMNS = [
  "รหัสสินค้า",
  "ชื่อสินค้า",
  "จำนวนรวม",
  "หน่วยนับ",
  "ยอดขายรวม",
  "จำนวนใบ",
  "จำนวนลูกค้า",
] as const;

export type ProductRow = Record<(typeof PRODUCT_COLUMNS)[number], string | number>;

/** One row per product (SKU), sorted by sales value descending. */
export function summarizeByProduct(rows: OutputRow[]): ProductRow[] {
  const map = new Map<
    string,
    {
      code: string;
      name: string;
      unit: string;
      qty: number;
      sales: number;
      invoices: Set<string>;
      customers: Set<string>;
    }
  >();

  for (const r of rows) {
    const code = String(r["รหัสสินค้า"] ?? "");
    if (!code) continue;
    let a = map.get(code);
    if (!a) {
      a = {
        code,
        name: String(r["ชื่อสินค้า"] ?? ""),
        unit: String(r["หน่วยนับ"] ?? ""),
        qty: 0,
        sales: 0,
        invoices: new Set(),
        customers: new Set(),
      };
      map.set(code, a);
    }
    a.qty += num(r["จำนวน"]);
    a.sales += num(r["จำนวนเงิน"]);
    const inv = String(r["เลขที่ใบกำกับ"] ?? "");
    if (inv) a.invoices.add(inv);
    const cust = String(r["รหัสลูกค้า"] ?? "");
    if (cust) a.customers.add(cust);
  }

  return [...map.values()]
    .sort((x, y) => y.sales - x.sales)
    .map((a) => ({
      รหัสสินค้า: a.code,
      ชื่อสินค้า: a.name,
      จำนวนรวม: round(a.qty),
      หน่วยนับ: a.unit,
      ยอดขายรวม: round(a.sales),
      จำนวนใบ: a.invoices.size,
      จำนวนลูกค้า: a.customers.size,
    }));
}

/* ------------------------------- by day -------------------------------- */

export const DAILY_COLUMNS = ["วันที่", "ยอดขาย", "จำนวนใบ"] as const;

export interface DailyPoint {
  date: string;
  sales: number;
  invoices: number;
}

/**
 * Daily series, sorted ascending by date. `amountKey` picks the line-level money
 * column — "จำนวนเงิน" for sales, "เงินก่อนภาษี" for purchases.
 */
export function dailySales(
  rows: Record<string, string | number>[],
  amountKey = "จำนวนเงิน"
): DailyPoint[] {
  const map = new Map<string, { sales: number; invoices: Set<string> }>();
  for (const r of rows) {
    const d = String(r["วันที่เอกสาร"] ?? "").trim();
    if (!d) continue;
    let a = map.get(d);
    if (!a) {
      a = { sales: 0, invoices: new Set() };
      map.set(d, a);
    }
    a.sales += num(r[amountKey]);
    const inv = String(r["เลขที่ใบกำกับ"] ?? "");
    if (inv) a.invoices.add(inv);
  }
  return [...map.entries()]
    .map(([date, a]) => ({ date, sales: round(a.sales), invoices: a.invoices.size }))
    .sort((x, y) => dateKey(x.date) - dateKey(y.date));
}

/* ============================ purchases ============================ */
/*
 * Purchase rows keep the line amount in "เงินก่อนภาษี" (there is no separate
 * line-total column), while "ภาษีซื้อ"/"รวมทั้งสิ้น" are per-invoice values that
 * live only on the invoice's first line — so summing across rows nets correctly.
 * Purchases have no supplier code, so suppliers are grouped by name.
 */

export const SUPPLIER_COLUMNS = [
  "ชื่อผู้ขาย",
  "จำนวนใบเอกสาร",
  "จำนวนรายการ",
  "ยอดก่อนภาษี",
  "ภาษีซื้อ",
  "รวมทั้งสิ้น",
] as const;

export type SupplierRow = Record<(typeof SUPPLIER_COLUMNS)[number], string | number>;

/** One row per supplier (grouped by name), sorted by pre-tax spend descending. */
export function summarizeBySupplier(rows: PurchaseRow[]): SupplierRow[] {
  const map = new Map<
    string,
    { name: string; invoices: Set<string>; lines: number; preTax: number; tax: number; grand: number }
  >();

  for (const r of rows) {
    const name = String(r["ชื่อผู้ขาย"] ?? "");
    let a = map.get(name);
    if (!a) {
      a = { name, invoices: new Set(), lines: 0, preTax: 0, tax: 0, grand: 0 };
      map.set(name, a);
    }
    a.lines += 1;
    const inv = String(r["เลขที่ใบกำกับ"] ?? "");
    if (inv) a.invoices.add(inv);
    a.preTax += num(r["เงินก่อนภาษี"]);
    a.tax += num(r["ภาษีซื้อ"]);
    a.grand += num(r["รวมทั้งสิ้น"]);
  }

  return [...map.values()]
    .sort((x, y) => y.preTax - x.preTax)
    .map((a) => ({
      ชื่อผู้ขาย: a.name,
      จำนวนใบเอกสาร: a.invoices.size,
      จำนวนรายการ: a.lines,
      ยอดก่อนภาษี: round(a.preTax),
      ภาษีซื้อ: round(a.tax),
      รวมทั้งสิ้น: round(a.grand),
    }));
}

export const PURCHASE_PRODUCT_COLUMNS = [
  "รหัสสินค้า",
  "ชื่อสินค้า",
  "จำนวนรวม",
  "หน่วยนับ",
  "ยอดซื้อรวม",
  "จำนวนใบ",
  "จำนวนผู้ขาย",
] as const;

export type PurchaseProductRow = Record<
  (typeof PURCHASE_PRODUCT_COLUMNS)[number],
  string | number
>;

/** One row per purchased product (SKU), sorted by pre-tax spend descending. */
export function summarizeByPurchasedProduct(rows: PurchaseRow[]): PurchaseProductRow[] {
  const map = new Map<
    string,
    {
      code: string;
      name: string;
      unit: string;
      qty: number;
      spend: number;
      invoices: Set<string>;
      suppliers: Set<string>;
    }
  >();

  for (const r of rows) {
    const code = String(r["รหัสสินค้า"] ?? "");
    if (!code) continue;
    let a = map.get(code);
    if (!a) {
      a = {
        code,
        name: String(r["ชื่อสินค้า"] ?? ""),
        unit: String(r["หน่วยนับ"] ?? ""),
        qty: 0,
        spend: 0,
        invoices: new Set(),
        suppliers: new Set(),
      };
      map.set(code, a);
    }
    a.qty += num(r["จำนวน"]);
    a.spend += num(r["เงินก่อนภาษี"]);
    const inv = String(r["เลขที่ใบกำกับ"] ?? "");
    if (inv) a.invoices.add(inv);
    const sup = String(r["ชื่อผู้ขาย"] ?? "");
    if (sup) a.suppliers.add(sup);
  }

  return [...map.values()]
    .sort((x, y) => y.spend - x.spend)
    .map((a) => ({
      รหัสสินค้า: a.code,
      ชื่อสินค้า: a.name,
      จำนวนรวม: round(a.qty),
      หน่วยนับ: a.unit,
      ยอดซื้อรวม: round(a.spend),
      จำนวนใบ: a.invoices.size,
      จำนวนผู้ขาย: a.suppliers.size,
    }));
}
