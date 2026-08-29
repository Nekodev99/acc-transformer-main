"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, UploadCloud, Download, AlertCircle, X } from "lucide-react";
import { parseStock, STOCK_COLUMNS, type StockRow } from "@/lib/parseStock";
import { exportStockWorkbook } from "@/lib/exportExcel";
import { Stat, Hint, PreviewTable, fmt } from "@/components/ui";

interface Entry {
  id: string;
  name: string;
  rows: StockRow[];
  error?: string;
}

let counter = 0;

export default function StockApp() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [dragging, setDragging] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
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
        const id = `s${++counter}`;
        try {
          return { id, name: f.name, rows: parseStock(await f.arrayBuffer()) };
        } catch (e) {
          return {
            id,
            name: f.name,
            rows: [],
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
  const allRows = useMemo<StockRow[]>(() => ok.flatMap((e) => e.rows), [ok]);

  const warehouses = useMemo(
    () => new Set(allRows.map((r) => String(r["รหัสคลัง"] ?? "")).filter(Boolean)).size,
    [allRows]
  );
  const locations = useMemo(
    () => new Set(allRows.map((r) => `${r["รหัสคลัง"]}|${r["รหัสที่เก็บ"]}`)).size,
    [allRows]
  );

  const download = () => {
    if (allRows.length === 0) return;
    exportStockWorkbook(allRows, "ยอดคงเหลือ");
  };

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
          <p className="font-medium">ลากไฟล์รายงานยอดสินค้าคงเหลือมาวาง หรือคลิกเพื่อเลือก (เลือกได้หลายไฟล์)</p>
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="ไฟล์" value={ok.length} />
            <Stat label="แถวสินค้า" value={allRows.length} />
            <Stat label="คลัง" value={warehouses} />
            <Stat label="ที่เก็บ" value={locations} />
          </div>

          <div className="mt-5 flex justify-end">
            <button
              onClick={download}
              className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              <Download className="h-4 w-4" />
              ดาวน์โหลด Excel
            </button>
          </div>

          <Hint>
            แสดง {Math.min(20, allRows.length)} แถวแรก จาก {allRows.length.toLocaleString()} แถว
          </Hint>
          <PreviewTable
            columns={[...STOCK_COLUMNS]}
            rows={allRows.slice(0, 20).map((r) => [...STOCK_COLUMNS].map((c) => fmt(r[c] ?? "")))}
            numericFrom={7}
          />
        </section>
      )}
    </>
  );
}
