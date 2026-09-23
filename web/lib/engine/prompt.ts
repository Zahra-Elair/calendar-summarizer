import type { CalEvent, Period, Summary } from "./types";
import { SummarizerError } from "./errors";

export function totalScheduledHours(events: CalEvent[]): number {
  const ms = events.reduce(
    (acc, e) => acc + (e.allDay ? 0 : e.end.getTime() - e.start.getTime()),
    0,
  );
  return Math.floor((ms / 3_600_000) * 10) / 10;
}

function formatEvent(e: CalEvent): string {
  const when = `${e.start.toISOString()}–${e.end.toISOString()}`;
  const parts = [when, e.title];
  if (e.location) parts.push(`@ ${e.location}`);
  if (e.attendees.length) parts.push(`with ${e.attendees.join(", ")}`);
  return parts.join(" | ");
}

export function buildPrompt(
  events: CalEvent[], period: Period, startISO: string, endISO: string,
): string {
  const eventsBlock = events.length ? events.map(formatEvent).join("\n") : "(no events)";
  const hours = totalScheduledHours(events);
  return [
    "You are a helpful assistant that summarizes a person's calendar.",
    `Write a ${period} summary for the period ${startISO} (inclusive) to ${endISO} (exclusive).`,
    "",
    `Total scheduled hours (computed for you, use it — do not invent numbers): ${hours}`,
    `Number of events: ${events.length}`,
    "",
    `Events:\n${eventsBlock}`,
    "",
    "For a daily summary be concrete and time-ordered. For weekly or monthly, zoom out to themes, busiest days, and overall load rather than listing every event.",
    "",
    'Respond ONLY with a JSON object with exactly these keys: "overview" (string, 1-2 sentences), "keyEvents" (array of short strings), "timeBreakdown" (string), "highlights" (array of short strings).',
  ].join("\n");
}

function stripCodeFence(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.includes("\n") ? t.slice(t.indexOf("\n") + 1) : t;
    const fence = t.lastIndexOf("```");
    if (fence !== -1) t = t.slice(0, fence);
  }
  return t.trim();
}

export function parseResponse(
  raw: string, period: Period, startISO: string, endISO: string,
): Summary {
  const data: unknown = JSON.parse(stripCodeFence(raw));
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new SummarizerError("Unexpected response shape from model (expected a JSON object).");
  }
  const d = data as Record<string, unknown>;
  return {
    period, start: startISO, end: endISO,
    overview: typeof d.overview === "string" ? d.overview : "",
    keyEvents: Array.isArray(d.keyEvents) ? d.keyEvents.map(String) : [],
    timeBreakdown: typeof d.timeBreakdown === "string" ? d.timeBreakdown : "",
    highlights: Array.isArray(d.highlights) ? d.highlights.map(String) : [],
    empty: false,
  };
}
