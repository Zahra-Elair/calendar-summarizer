import { describe, it, expect } from "vitest";
import { mapGoogleEvent } from "./google-calendar";

describe("mapGoogleEvent", () => {
  it("maps a timed event", () => {
    const e = mapGoogleEvent({
      summary: "Design review",
      start: { dateTime: "2026-09-22T14:00:00Z" },
      end: { dateTime: "2026-09-22T15:00:00Z" },
      location: "Room 4B",
      attendees: [{ email: "a@x.com" }, { displayName: "Bob" }],
      description: "d",
    });
    expect(e.title).toBe("Design review");
    expect(e.allDay).toBe(false);
    expect(e.location).toBe("Room 4B");
    expect(e.attendees).toEqual(["a@x.com", "Bob"]);
    expect(e.start.toISOString()).toBe("2026-09-22T14:00:00.000Z");
  });

  it("maps an all-day event", () => {
    const e = mapGoogleEvent({
      summary: "Holiday",
      start: { date: "2026-09-22" },
      end: { date: "2026-09-23" },
    });
    expect(e.allDay).toBe(true);
    expect(e.attendees).toEqual([]);
  });

  it("defaults a missing title", () => {
    const e = mapGoogleEvent({ start: { dateTime: "2026-09-22T09:00:00Z" }, end: { dateTime: "2026-09-22T09:15:00Z" } });
    expect(e.title).toBe("(no title)");
  });
});
