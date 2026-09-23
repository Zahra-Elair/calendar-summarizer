"use client";
import { useState } from "react";
import { DateTime } from "luxon";
import { signIn } from "next-auth/react";
import type { Period, Summary } from "@/lib/engine/types";
import { generateSummary } from "@/lib/actions";
import { PeriodSelector } from "./PeriodSelector";
import { SummaryView } from "./SummaryView";

export function DashboardClient() {
  const today = DateTime.now().toISODate()!;
  const [period, setPeriod] = useState<Period>("weekly");
  const [date, setDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  async function run() {
    setLoading(true); setError(null); setSummary(null); setNeedsSignIn(false);
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const res = await generateSummary({ period, date, zone });
    setLoading(false);
    if (res.ok) setSummary(res.summary);
    else {
      setError(res.error);
      setNeedsSignIn(Boolean(res.needsSignIn));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <PeriodSelector value={period} onChange={setPeriod} disabled={loading} />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={loading}
          className="rounded-lg border px-3 py-1.5 text-sm" />
        <button onClick={run} disabled={loading}
          className="rounded-lg bg-black px-5 py-2 text-white hover:bg-gray-800 disabled:opacity-50">
          {loading ? "Summarizing…" : "Summarize"}
        </button>
      </div>

      {error && needsSignIn && (
        <div className="rounded-lg bg-amber-50 p-4 text-amber-800">
          <p>{error}</p>
          <button
            onClick={() => signIn("google", { redirectTo: "/dashboard" })}
            className="mt-3 rounded-lg bg-black px-5 py-2 text-white hover:bg-gray-800"
          >
            Sign in with Google
          </button>
        </div>
      )}
      {error && !needsSignIn && <p className="rounded-lg bg-red-50 p-4 text-red-700">{error}</p>}
      {summary && (summary.empty
        ? <p className="rounded-lg bg-gray-50 p-4 text-gray-600">Nothing scheduled for this period.</p>
        : <div className="rounded-xl border bg-white p-6 shadow-sm"><SummaryView summary={summary} /></div>)}
    </div>
  );
}
