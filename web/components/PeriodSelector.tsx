"use client";
import type { Period } from "@/lib/engine/types";

const PERIODS: Period[] = ["daily", "weekly", "monthly"];

export function PeriodSelector({ value, onChange, disabled }: {
  value: Period; onChange: (p: Period) => void; disabled?: boolean;
}) {
  return (
    <div className="inline-flex rounded-lg border bg-white p-1">
      {PERIODS.map((p) => (
        <button key={p} type="button" disabled={disabled} onClick={() => onChange(p)}
          className={`rounded-md px-4 py-1.5 text-sm capitalize transition ${
            value === p ? "bg-black text-white" : "text-gray-600 hover:bg-gray-100"
          }`}>
          {p}
        </button>
      ))}
    </div>
  );
}
