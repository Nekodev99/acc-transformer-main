"use client";

/** Shared presentational bits used by both the sales and purchase screens. */

export const fmt = (v: string | number) =>
  typeof v === "number"
    ? v.toLocaleString("en-US", { maximumFractionDigits: 6 })
    : v;

export function Stat({ label, value, money }: { label: string; value: number; money?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 px-4 py-3">
      <div className={`font-semibold text-slate-900 ${money ? "text-xl" : "text-2xl"}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

export function DateSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-xs text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
      >
        <option value="">— ทั้งหมด —</option>
        {options.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ToggleBtn({
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
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

export function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-xs text-slate-500">{children}</p>;
}

export function PreviewTable({
  columns,
  rows,
  numericFrom,
}: {
  columns: string[];
  rows: (string | number)[][];
  numericFrom?: number;
}) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-xs">
        <thead className="bg-slate-100 text-slate-700">
          <tr>
            {columns.map((c, i) => (
              <th
                key={c}
                className={`whitespace-nowrap px-3 py-2 font-semibold ${
                  numericFrom != null && i >= numericFrom ? "text-right" : "text-left"
                }`}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className={ri % 2 ? "bg-slate-50" : "bg-white"}>
              {r.map((v, ci) => (
                <td
                  key={ci}
                  className={`whitespace-nowrap px-3 py-1.5 text-slate-700 ${
                    numericFrom != null && ci >= numericFrom ? "text-right" : "text-left"
                  }`}
                >
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
