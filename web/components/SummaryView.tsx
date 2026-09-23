import type { Summary } from "@/lib/engine/types";

export function SummaryView({ summary }: { summary: Summary }) {
  return (
    <div className="space-y-4">
      <p className="text-lg">{summary.overview}</p>
      <Section title="Key events" items={summary.keyEvents} />
      <p className="text-sm text-gray-600">Time: {summary.timeBreakdown}</p>
      <Section title="Highlights" items={summary.highlights} />
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      {items.length ? (
        <ul className="list-disc pl-5 text-gray-800">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
      ) : (
        <p className="text-gray-400">(none)</p>
      )}
    </div>
  );
}
