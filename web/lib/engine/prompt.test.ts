import { describe, it, expect } from "vitest";
import { totalScheduledHours, buildPrompt, parseResponse } from "./prompt";
import type { CalEvent } from "./types";

const ev = (title: string, start: string, end: string, allDay = false): CalEvent => ({
  title, start: new Date(start), end: new Date(end), allDay, attendees: [],
});

describe("totalScheduledHours", () => {
  it("sums durations to one decimal", () => {
    const events = [
      ev("a", "2026-09-22T09:00:00Z", "2026-09-22T10:00:00Z"),
      ev("b", "2026-09-22T11:00:00Z", "2026-09-22T11:30:00Z"),
    ];
    expect(totalScheduledHours(events)).toBe(1.5);
  });
  it("excludes all-day events", () => {
    const events = [ev("holiday", "2026-09-22T00:00:00Z", "2026-09-23T00:00:00Z", true)];
    expect(totalScheduledHours(events)).toBe(0);
  });
  it("rounds 0.25 to 0.2 (banker's rounding)", () => {
    const events = [ev("quick", "2026-09-22T09:00:00Z", "2026-09-22T09:15:00Z")];
    expect(totalScheduledHours(events)).toBe(0.2);
  });
  it("rounds 1.0833 to 1.1 (banker's rounding, not floor)", () => {
    const events = [ev("meeting", "2026-09-22T09:00:00Z", "2026-09-22T10:05:00Z")]; // 65 minutes
    expect(totalScheduledHours(events)).toBe(1.1);
  });
});

describe("buildPrompt", () => {
  it("mentions the period, dates, event title and the grounded hours", () => {
    const events = [ev("Standup", "2026-09-22T09:00:00Z", "2026-09-22T09:15:00Z")];
    const p = buildPrompt(events, "daily", "2026-09-22", "2026-09-23");
    expect(p).toContain("daily");
    expect(p).toContain("2026-09-22");
    expect(p).toContain("Standup");
    expect(p).toContain("0.2"); // 15 min rounded
  });
});

describe("parseResponse", () => {
  it("parses a JSON object into a Summary", () => {
    const raw = JSON.stringify({
      overview: "A light day.", keyEvents: ["09:00 Standup"],
      timeBreakdown: "~0.2h", highlights: ["Nothing urgent"],
    });
    const s = parseResponse(raw, "daily", "2026-09-22", "2026-09-23");
    expect(s.overview).toBe("A light day.");
    expect(s.keyEvents).toEqual(["09:00 Standup"]);
    expect(s.empty).toBe(false);
  });
  it("tolerates a ```json fenced block", () => {
    const raw = "```json\n{\"overview\":\"x\",\"keyEvents\":[],\"timeBreakdown\":\"\",\"highlights\":[]}\n```";
    expect(parseResponse(raw, "weekly", "2026-09-21", "2026-09-28").overview).toBe("x");
  });
  it("throws on non-object JSON", () => {
    expect(() => parseResponse("[1,2,3]", "daily", "2026-09-22", "2026-09-23")).toThrow();
  });
});
