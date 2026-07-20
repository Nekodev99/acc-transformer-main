"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  FileSpreadsheet,
  UploadCloud,
  Download,
  AlertCircle,
  X,
  Users,
  ListOrdered,
  Package,
  BarChart3,
  ShoppingCart,
  Truck,
} from "lucide-react";
import {
  parseReport,
  OUTPUT_COLUMNS,
  TYPE_LABELS,
  type ReportType,
} from "@/lib/parseReport";
import {
  summarizeByCustomer,
  summarizeByProduct,
  dailySales,
  dateKey,
  SUMMARY_COLUMNS,
  PRODUCT_COLUMNS,
} from "@/lib/aggregate";
import { exportWorkbook, type DetailRow } from "@/lib/exportExcel";
import DailyChart from "@/components/DailyChart";
import PurchaseApp from "@/components/PurchaseApp";
import { Stat, DateSelect, ToggleBtn, Hint, PreviewTable, fmt } from "@/components/ui";

interface Entry {
  id: string;
  name: string;
  type: ReportType;
  rows: DetailRow[];
  invoiceCount: number;
  error?: string;
  buffer: ArrayBuffer;
}

type View = "detail" | "customer" | "product" | "chart";
type Mode = "sale" | "purchase";

const TYPE_BADGE: Record<ReportType, string> = {
  cash: "bg-emerald-100 text-emerald-700",
  credit: "bg-sky-100 text-sky-700",
  return: "bg-rose-100 text-rose-700",
};

let counter = 0;

export default function Home() {
  const [mode, setMode] = useState<Mode>("sale");

  return (
    <main className="flex-1">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto max-w-6xl px-6 py-7">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-8 w-8 text-emerald-400" />
            <div>
              <h1 className="text-xl font-semibold">แปลงรายงาน ACC → ตารางข้อมูล</h1>
              <p className="text-sm text-slate-300">
                {mode === "sale"
                  ? "รวมหลายไฟล์ · สรุปตามลูกค้า/สินค้า · กราฟยอดขายรายวัน · กรองช่วงวันที่"
                  : "รวมหลายไฟล์ · สรุปตามผู้ขาย/สินค้า · กราฟยอดซื้อรายวัน · กรองช่วงวันที่"}
              </p>
            </div>
          </div>

          {/* Mode switch */}
          <div className="mt-5 inline-flex rounded-lg bg-slate-800 p-1">
            <ModeBtn active={mode === "sale"} onClick={() => setMode("sale")} icon={<ShoppingCart className="h-4 w-4" />}>
              รายงานขาย
            </ModeBtn>
            <ModeBtn active={mode === "purchase"} onClick={() => setMode("purchase")} icon={<Truck className="h-4 w-4" />}>
              รายงานซื้อเชื่อ
            </ModeBtn>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {mode === "sale" ? <SaleApp /> : <PurchaseApp />}
      </div>

      <footer className="mx-auto max-w-6xl px-6 py-8 text-center text-xs text-slate-400">
        ประมวลผลทั้งหมดในเบราว์เซอร์ของคุณ — ไฟล์ไม่ถูกอัปโหลดไปที่เซิร์ฟเวอร์
      </footer>
    </main>
  );
}

function ModeBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-semibold transition ${
        active ? "bg-white text-slate-900" : "text-slate-300 hover:text-white"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function SaleApp() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [view, setView] = useState<View>("detail");
  const [dragging, setDragging] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const parseOne = useCallback(
    (buffer: ArrayBuffer, name: string, forced?: ReportType): Entry => {
      const id = `f${++counter}`;
      try {
        const res = parseReport(buffer, forced);
        const label = TYPE_LABELS[res.type];
        return {
          id,
          name,
          type: res.type,
          invoiceCount: res.invoiceCount,
          rows: res.rows.map((r) => ({ ...r, ประเภท: label })),
          buffer,
        };
      } catch (e) {
        return {
          id,
          name,
          type: "cash",
          rows: [],
          invoiceCount: 0,
          buffer,
          error: e instanceof Error ? e.message : "แปลงไฟล์ไม่สำเร็จ",
        };
      }
    },
    []
  );

  const addFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setGlobalError(null);
      const valid = Array.from(files).filter((f) => /\.(xls|xlsx)$/i.test(f.name));
      const skipped = files.length - valid.length;
      if (skipped > 0)
        setGlobalError(`ข้ามไฟล์ที่ไม่รองรับ ${skipped} ไฟล์ (รับเฉพาะ .xls / .xlsx)`);
      const parsed = await Promise.all(
        valid.map(async (f) => parseOne(await f.arrayBuffer(), f.name))
      );
      setEntries((prev) => [...prev, ...parsed]);
    },
    [parseOne]
  );

  const removeEntry = (id: string) =>
    setEntries((prev) => prev.filter((e) => e.id !== id));

  const changeType = (id: string, type: ReportType) =>
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? parseOne(e.buffer, e.name, type) : e))
    );

  const ok = entries.filter((e) => !e.error);
  const allRows = useMemo<DetailRow[]>(() => ok.flatMap((e) => e.rows), [ok]);

  // available date range (Buddhist DD/MM/YYYY) from the data
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

  const customers = useMemo(() => summarizeByCustomer(merged), [merged]);
  const products = useMemo(() => summarizeByProduct(merged), [merged]);
  const daily = useMemo(() => dailySales(merged), [merged]);
  const includeType = useMemo(() => ok.length > 1, [ok]);
  const totalInvoices = useMemo(
    () => new Set(merged.map((r) => String(r["เลขที่ใบกำกับ"] ?? "")).filter(Boolean)).size,
    [merged]
  );
  const netSales = useMemo(
    () => merged.reduce((s, r) => s + (typeof r["จำนวนเงิน"] === "number" ? (r["จำนวนเงิน"] as number) : 0), 0),
    [merged]
  );

  const download = () => {
    if (merged.length === 0) return;
    const types = new Set(ok.map((e) => e.type));
    const base = types.size === 1 ? TYPE_LABELS[[...types][0]].replace(/[\s/]+/g, "") : "รวม";
    exportWorkbook({ detail: merged, customers, products, daily, includeType, filenameBase: base });
  };

  const detailCols = includeType ? (["ประเภท", ...OUTPUT_COLUMNS] as const) : OUTPUT_COLUMNS;
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
          <p className="font-medium">ลากไฟล์มาวาง หรือคลิกเพื่อเลือก (เลือกได้หลายไฟล์)</p>
          <p className="mt-1 text-sm text-slate-500">รองรับ .xls และ .xlsx</p>
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
                  <>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_BADGE[e.type]}`}>
                      {TYPE_LABELS[e.type]}
                    </span>
                    <span className="text-slate-500">{e.rows.length.toLocaleString()} แถว</span>
                    <select
                      value={e.type}
                      onChange={(ev) => changeType(e.id, ev.target.value as ReportType)}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-emerald-500"
                      title="แก้ประเภทรายงานหากตรวจผิด"
                    >
                      <option value="cash">{TYPE_LABELS.cash}</option>
                      <option value="credit">{TYPE_LABELS.credit}</option>
                      <option value="return">{TYPE_LABELS.return}</option>
                    </select>
                  </>
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
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="ไฟล์" value={ok.length} />
            <Stat label="แถวสินค้า" value={merged.length} />
            <Stat label="ใบเอกสาร" value={totalInvoices} />
            <Stat label="ลูกค้า" value={customers.length} />
            <Stat label="ยอดขายสุทธิ" value={Math.round(netSales)} money />
          </div>

          {/* Date range filter */}
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

          {/* Toolbar */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex flex-wrap rounded-lg border border-slate-200 p-0.5">
              <ToggleBtn active={view === "detail"} onClick={() => setView("detail")} icon={<ListOrdered className="h-4 w-4" />}>
                รายละเอียด
              </ToggleBtn>
              <ToggleBtn active={view === "customer"} onClick={() => setView("customer")} icon={<Users className="h-4 w-4" />}>
                ตามลูกค้า
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

          {/* Views */}
          {view === "detail" && (
            <>
              <Hint>
                แสดง {Math.min(20, merged.length)} แถวแรก จาก {merged.length.toLocaleString()} แถว
              </Hint>
              <PreviewTable
                columns={[...detailCols]}
                rows={merged.slice(0, 20).map((r) => [...detailCols].map((c) => fmt(r[c] ?? "")))}
              />
            </>
          )}

          {view === "customer" && (
            <>
              <Hint>
                {customers.length.toLocaleString()} ลูกค้า
                {ok.some((e) => e.type === "return") && " · ยอดสุทธิหักรับคืน/ลดหนี้แล้ว"}
              </Hint>
              <PreviewTable
                columns={[...SUMMARY_COLUMNS]}
                rows={customers.slice(0, 50).map((r) => [...SUMMARY_COLUMNS].map((c) => fmt(r[c] ?? "")))}
                numericFrom={2}
              />
            </>
          )}

          {view === "product" && (
            <>
              <Hint>{products.length.toLocaleString()} รายการสินค้า · เรียงตามยอดขายมากไปน้อย</Hint>
              <PreviewTable
                columns={[...PRODUCT_COLUMNS]}
                rows={products.slice(0, 50).map((r) => [...PRODUCT_COLUMNS].map((c) => fmt(r[c] ?? "")))}
                numericFrom={2}
              />
            </>
          )}

          {view === "chart" && (
            <>
              <Hint>ยอดขายสุทธิรายวัน (Σ จำนวนเงิน) · {daily.length} วัน</Hint>
              <DailyChart data={daily} />
            </>
          )}
        </section>
      )}
    </>
  );
}
