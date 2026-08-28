import * as XLSX from "xlsx";
import { OUTPUT_COLUMNS, OutputRow } from "./parseReport";
import { PURCHASE_COLUMNS, PurchaseRow } from "./parsePurchase";
import { DO_COLUMNS, DORow } from "./parseDO";
import {
  SUMMARY_COLUMNS,
  SummaryRow,
  PRODUCT_COLUMNS,
  ProductRow,
  DAILY_COLUMNS,
  DailyPoint,
  SUPPLIER_COLUMNS,
  SupplierRow,
  PURCHASE_PRODUCT_COLUMNS,
  PurchaseProductRow,
} from "./aggregate";

/** A detail row that may carry a report-type label (used when merging files). */
export type DetailRow = OutputRow & { ประเภท?: string };

const DETAIL_WIDTHS = [12, 34, 13, 16, 13, 40, 9, 10, 11, 13, 11, 13, 13];
const SUMMARY_WIDTHS = [14, 34, 14, 12, 14, 14, 12, 14];
const PRODUCT_WIDTHS = [14, 40, 12, 10, 14, 10, 12];
const DAILY_WIDTHS = [14, 16, 12];

function aoaSheet(
  columns: readonly string[],
  rows: Record<string, string | number>[],
  widths: number[]
): XLSX.WorkSheet {
  const aoa: (string | number)[][] = [
    [...columns],
    ...rows.map((r) => columns.map((c) => r[c] ?? "")),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = widths.map((w) => ({ wch: w }));
  return ws;
}

export interface ExportData {
  detail: DetailRow[];
  customers: SummaryRow[];
  products: ProductRow[];
  daily: DailyPoint[];
  includeType: boolean;
  filenameBase: string;
}

/**
 * Export a workbook with four sheets: รายละเอียด, สรุปตามลูกค้า,
 * สรุปตามสินค้า, ยอดขายรายวัน. A leading ประเภท column is added to the detail
 * sheet when multiple report types are merged.
 */
export function exportWorkbook(data: ExportData): void {
  const { detail, customers, products, daily, includeType, filenameBase } = data;

  const detailCols = includeType ? ["ประเภท", ...OUTPUT_COLUMNS] : [...OUTPUT_COLUMNS];
  const detailWidths = includeType ? [16, ...DETAIL_WIDTHS] : DETAIL_WIDTHS;

  const dailyRows = daily.map((d) => ({
    วันที่: d.date,
    ยอดขาย: d.sales,
    จำนวนใบ: d.invoices,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, aoaSheet(detailCols, detail, detailWidths), "รายละเอียด");
  XLSX.utils.book_append_sheet(wb, aoaSheet([...SUMMARY_COLUMNS], customers, SUMMARY_WIDTHS), "สรุปตามลูกค้า");
  XLSX.utils.book_append_sheet(wb, aoaSheet([...PRODUCT_COLUMNS], products, PRODUCT_WIDTHS), "สรุปตามสินค้า");
  XLSX.utils.book_append_sheet(wb, aoaSheet([...DAILY_COLUMNS], dailyRows, DAILY_WIDTHS), "ยอดขายรายวัน");

  saveWorkbook(wb, filenameBase);
}

/* ----------------------------- purchases ----------------------------- */

const PURCHASE_DETAIL_WIDTHS = [13, 11, 22, 45, 42, 20, 9, 11, 11, 13, 11, 13];
const SUPPLIER_WIDTHS = [42, 14, 12, 14, 12, 14];
const PURCHASE_PRODUCT_WIDTHS = [12, 45, 12, 10, 14, 10, 12];
const PURCHASE_DAILY_WIDTHS = [14, 16, 12];

export interface PurchaseExportData {
  detail: PurchaseRow[];
  suppliers: SupplierRow[];
  products: PurchaseProductRow[];
  daily: DailyPoint[];
  filenameBase: string;
}

/** Purchase workbook: รายละเอียด, สรุปตามผู้ขาย, สรุปตามสินค้า, ยอดซื้อรายวัน. */
export function exportPurchaseWorkbook(data: PurchaseExportData): void {
  const { detail, suppliers, products, daily, filenameBase } = data;

  const dailyRows = daily.map((d) => ({
    วันที่: d.date,
    ยอดซื้อ: d.sales,
    จำนวนใบ: d.invoices,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, aoaSheet([...PURCHASE_COLUMNS], detail, PURCHASE_DETAIL_WIDTHS), "รายละเอียด");
  XLSX.utils.book_append_sheet(wb, aoaSheet([...SUPPLIER_COLUMNS], suppliers, SUPPLIER_WIDTHS), "สรุปตามผู้ขาย");
  XLSX.utils.book_append_sheet(wb, aoaSheet([...PURCHASE_PRODUCT_COLUMNS], products, PURCHASE_PRODUCT_WIDTHS), "สรุปตามสินค้า");
  XLSX.utils.book_append_sheet(wb, aoaSheet(["วันที่", "ยอดซื้อ", "จำนวนใบ"], dailyRows, PURCHASE_DAILY_WIDTHS), "ยอดซื้อรายวัน");

  saveWorkbook(wb, filenameBase);
}

/* -------------------------- goods receipt (DO) -------------------------- */

const DO_WIDTHS = [13, 11, 17, 45, 16, 14, 14, 42, 8, 11, 10, 10];

/** DO workbook: a single flat sheet matching the hand-corrected "หลัง" tab. */
export function exportDOWorkbook(detail: DORow[], filenameBase: string): void {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, aoaSheet([...DO_COLUMNS], detail, DO_WIDTHS), "รับสินค้า (DO)");
  saveWorkbook(wb, filenameBase);
}

function saveWorkbook(wb: XLSX.WorkBook, filenameBase: string): void {
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const today = new Date().toISOString().slice(0, 10);
  const name = `แปลงแล้ว_${filenameBase}_${today}.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
