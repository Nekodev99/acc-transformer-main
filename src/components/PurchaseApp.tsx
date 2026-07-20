"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  FileSpreadsheet,
  UploadCloud,
  Download,
  AlertCircle,
  X,
  Truck,
  ListOrdered,
  Package,
  BarChart3,
} from "lucide-react";
import { parsePurchase, PURCHASE_COLUMNS, type PurchaseRow } from "@/lib/parsePurchase";
import {
  summarizeBySupplier,
  summarizeByPurchasedProduct,
  dailySales,
  dateKey,
  SUPPLIER_COLUMNS,
  PURCHASE_PRODUCT_COLUMNS,
} from "@/lib/aggregate";
import { exportPurchaseWorkbook } from "@/lib/exportExcel";
import DailyChart from "@/components/DailyChart";
import { Stat, DateSelect, ToggleBtn, Hint, PreviewTable, fmt } from "@/components/ui";

interface Entry {
  id: string;
  name: string;
  rows: PurchaseRow[];
  invoiceCount: number;
  error?: string;
}

type View = "detail" | "supplier" | "product" | "chart";

let counter = 0;

export default function PurchaseApp() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [view, setView] = useState<View>("detail");
  const [dragging, setDragging] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setGlobalError(null);
    const valid = Array.from(files).filter((f) => /\.(xls|xlsx)$/i.test(f.name));
    const skipped = files.length - valid.length;
    if (skipped > 0)
      setGlobalError(`ข้ามไฟล์ที่ไม่รองรับ ${skipped} ไฟล์ (รับเฉพาะ .xls / .xlsx)`);
    const parsed = await Promise.all(
      valid.map(async (f): Promise<Entry> => {
        const id = `p${++counter}`;
        try {
          const res = parsePurchase(await f.arrayBuffer());
          return { id, name: f.name, rows: res.rows, invoiceCount: res.invoiceCount };
        } catch (e) {
          return {
            id,
            name: f.name,
            rows: [],
            invoiceCount: 0,
            error: e instanceof Error ? e.message : "แปลงไฟล์ไม่สำเร็จ",
          };
        }
      })
    );
    setEntries((prev) => [...prev, ...parsed]);
  }, []);

  const removeEntry = (id: string) =>
    setEntries((prev) => prev.filter((e) => e.id !== id));

  const ok = entries.filter((e) => !e.error);
  const allRows = useMemo<PurchaseRow[]>(() => ok.flatMap((e) => e.rows), [ok]);

  const dates = useMemo(
    () =>
      [...new Set(allRows.map((r) => String(r["วันที่เอกสาร"] ?? "")).filter(Boolean))].sort(
        (a, b) => dateKey(a) - dateKey(b)
      ),
    [allRows]
  );

  const merged = useMemo(() => {
    const lo = from ? dateKey(from) : -Infinity;
    const hi = to ? dateKey(to) : Infinity;
    if (lo === -Infinity && hi === Infinity) return allRows;
    return allRows.filter((r) => {
      const k = dateKey(String(r["วันที่เอกสาร"] ?? ""));
      return k >= lo && k <= hi;
    });
  }, [allRows, from, to]);

  const suppliers = useMemo(() => summarizeBySupplier(merged), [merged]);
  const products = useMemo(() => summarizeByPurchasedProduct(merged), [merged]);
  const daily = useMemo(() => dailySales(merged, "เงินก่อนภาษี"), [merged]);
  const totalInvoices = useMemo(
    () => new Set(merged.map((r) => String(r["เลขที่ใบกำกับ"] ?? "")).filter(Boolean)).size,
    [merged]
  );
  const netSpend = useMemo(
    () =>
      merged.reduce(
        (s, r) => s + (typeof r["เงินก่อนภาษี"] === "number" ? (r["เงินก่อนภาษี"] as number) : 0),
        0
      ),
    [merged]
  );

  const download = () => {
    if (merged.length === 0) return;
    exportPurchaseWorkbook({ detail: merged, suppliers, products, daily, filenameBase: "ซื้อเชื่อ" });
  };

  const filterActive = Boolean(from || to);

  return (
    <>
      {/* Upload */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition ${
            dragging
              ? "border-emerald-500 bg-emerald-50"
              : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
          }`}
        >
          <UploadCloud className="mb-3 h-10 w-10 text-slate-400" />
          <p className="font-medium">ลากไฟล์รายงานซื้อเชื่อมาวาง หรือคลิกเพื่อเลือก (เลือกได้หลายไฟล์)</p>
          <p className="mt-1 text-sm text-slate-500">รองรับ .xls และ .xlsx · ช่อง “หมวด” เว้นว่างให้กรอกเองใน Excel</p>
          <input
            ref={inputRef}
            type="file"
            accept=".xls,.xlsx"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {globalError && (
          <div className="mt-4 flex items-start gap-2 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{globalError}</span>
          </div>
        )}

        {entries.length > 0 && (
          <ul className="mt-5 space-y-2">
            {entries.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm"
              >
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate font-medium" title={e.name}>
                  {e.name}
                </span>
                {e.error ? (
                  <span className="flex items-center gap-1 text-rose-600">
                    <AlertCircle className="h-4 w-4" /> {e.error}
                  </span>
                ) : (
                  <span className="text-slate-500">{e.rows.length.toLocaleString()} แถว</span>
                )}
                <button
                  onClick={() => removeEntry(e.id)}
                  className="rounded p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                  title="ลบไฟล์นี้"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Result */}
      {allRows.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="ไฟล์" value={ok.length} />
            <Stat label="แถวสินค้า" value={merged.length} />
            <Stat label="ใบเอกสาร" value={totalInvoices} />
            <Stat label="ผู้ขาย" value={suppliers.length} />
            <Stat label="ยอดซื้อก่อนภาษี" value={Math.round(netSpend)} money />
          </div>

          {dates.length > 0 && (
            <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 px-4 py-3">
              <span className="text-sm font-medium text-slate-700">ช่วงวันที่:</span>
              <DateSelect label="จาก" value={from} options={dates} onChange={setFrom} />
              <DateSelect label="ถึง" value={to} options={dates} onChange={setTo} />
              {filterActive && (
                <button
                  onClick={() => {
                    setFrom("");
                    setTo("");
                  }}
                  className="text-sm text-emerald-700 underline-offset-2 hover:underline"
                >
                  ล้างตัวกรอง
                </button>
              )}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex flex-wrap rounded-lg border border-slate-200 p-0.5">
              <ToggleBtn active={view === "detail"} onClick={() => setView("detail")} icon={<ListOrdered className="h-4 w-4" />}>
                รายละเอียด
              </ToggleBtn>
              <ToggleBtn active={view === "supplier"} onClick={() => setView("supplier")} icon={<Truck className="h-4 w-4" />}>
                ตามผู้ขาย
              </ToggleBtn>
              <ToggleBtn active={view === "product"} onClick={() => setView("product")} icon={<Package className="h-4 w-4" />}>
                ตามสินค้า
              </ToggleBtn>
              <ToggleBtn active={view === "chart"} onClick={() => setView("chart")} icon={<BarChart3 className="h-4 w-4" />}>
                กราฟรายวัน
              </ToggleBtn>
            </div>
            <button
              onClick={download}
              className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              <Download className="h-4 w-4" />
              ดาวน์โหลด Excel (4 ชีต)
            </button>
          </div>

          {view === "detail" && (
            <>
              <Hint>
                แสดง {Math.min(20, merged.length)} แถวแรก จาก {merged.length.toLocaleString()} แถว
              </Hint>
              <PreviewTable
                columns={[...PURCHASE_COLUMNS]}
                rows={merged.slice(0, 20).map((r) => [...PURCHASE_COLUMNS].map((c) => fmt(r[c] ?? "")))}
                numericFrom={6}
              />
            </>
          )}

          {view === "supplier" && (
            <>
              <Hint>{suppliers.length.toLocaleString()} ผู้ขาย · เรียงตามยอดซื้อมากไปน้อย</Hint>
              <PreviewTable
                columns={[...SUPPLIER_COLUMNS]}
                rows={suppliers.slice(0, 50).map((r) => [...SUPPLIER_COLUMNS].map((c) => fmt(r[c] ?? "")))}
                numericFrom={1}
              />
            </>
          )}

          {view === "product" && (
            <>
              <Hint>{products.length.toLocaleString()} รายการสินค้า · เรียงตามยอดซื้อมากไปน้อย</Hint>
              <PreviewTable
                columns={[...PURCHASE_PRODUCT_COLUMNS]}
                rows={products.slice(0, 50).map((r) => [...PURCHASE_PRODUCT_COLUMNS].map((c) => fmt(r[c] ?? "")))}
                numericFrom={2}
              />
            </>
          )}

          {view === "chart" && (
            <>
              <Hint>ยอดซื้อก่อนภาษีรายวัน (Σ เงินก่อนภาษี) · {daily.length} วัน</Hint>
              <DailyChart data={daily} />
            </>
          )}
        </section>
      )}
    </>
  );
}
