"use client";

import { useState } from "react";
import type { DailyPoint } from "@/lib/aggregate";

const fmtMoney = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 0 });

/** Lightweight responsive SVG bar chart for the daily sales series. */
export default function DailyChart({ data }: { data: DailyPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0)
    return <p className="mt-4 text-sm text-slate-500">ไม่มีข้อมูลในช่วงที่เลือก</p>;

  const W = 920;
  const H = 280;
  const pad = { top: 16, right: 16, bottom: 56, left: 64 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  const max = Math.max(...data.map((d) => d.sales), 0);
  const min = Math.min(...data.map((d) => d.sales), 0);
  const span = max - min || 1;
  const y = (v: number) => pad.top + innerH * (1 - (v - min) / span);
  const zeroY = y(0);

  const gap = data.length > 1 ? 0.25 : 0;
  const slot = innerW / data.length;
  const barW = slot * (1 - gap);

  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => min + (span * i) / ticks);
  const showEveryLabel = data.length <= 16;

  return (
    <div className="mt-4 overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="min-w-[640px] w-full"
        role="img"
        aria-label="กราฟยอดขายรายวัน"
      >
        {/* gridlines + y labels */}
        {tickVals.map((v, i) => (
          <g key={i}>
            <line
              x1={pad.left}
              x2={W - pad.right}
              y1={y(v)}
              y2={y(v)}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
            <text
              x={pad.left - 8}
              y={y(v) + 4}
              textAnchor="end"
              className="fill-slate-400"
              fontSize={11}
            >
              {fmtMoney(v)}
            </text>
          </g>
        ))}

        {/* zero baseline */}
        <line
          x1={pad.left}
          x2={W - pad.right}
          y1={zeroY}
          y2={zeroY}
          stroke="#94a3b8"
          strokeWidth={1}
        />

        {/* bars */}
        {data.map((d, i) => {
          const x = pad.left + slot * i + (slot - barW) / 2;
          const top = d.sales >= 0 ? y(d.sales) : zeroY;
          const h = Math.abs(y(d.sales) - zeroY);
          const active = hover === i;
          return (
            <g
              key={d.date}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <rect
                x={pad.left + slot * i}
                y={pad.top}
                width={slot}
                height={innerH}
                fill="transparent"
              />
              <rect
                x={x}
                y={top}
                width={barW}
                height={Math.max(h, 1)}
                rx={2}
                fill={d.sales < 0 ? "#f43f5e" : active ? "#059669" : "#10b981"}
              />
              {(showEveryLabel || i % Math.ceil(data.length / 12) === 0) && (
                <text
                  x={x + barW / 2}
                  y={H - pad.bottom + 16}
                  textAnchor="end"
                  className="fill-slate-500"
                  fontSize={10}
                  transform={`rotate(-40 ${x + barW / 2} ${H - pad.bottom + 16})`}
                >
                  {d.date.slice(0, 5)}
                </text>
              )}
            </g>
          );
        })}

        {/* tooltip */}
        {hover != null && (
          <g>
            <text
              x={pad.left}
              y={pad.top - 2}
              className="fill-slate-700 font-medium"
              fontSize={12}
            >
              {data[hover].date} · {fmtMoney(data[hover].sales)} บาท ·{" "}
              {data[hover].invoices} ใบ
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
