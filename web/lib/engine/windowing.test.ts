import { describe, it, expect } from "vitest";
import { windowFor } from "./windowing";

const ZONE = "UTC";

describe("windowFor", () => {
  it("daily is one day", () => {
    const { start, end } = windowFor("daily", "2026-09-22", ZONE);
    expect(start.toISODate()).toBe("2026-09-22");
    expect(end.toISODate()).toBe("2026-09-23");
  });
  it("weekly starts Monday", () => {
    // 2026-09-22 is a Tuesday → week is Mon 21 .. next Mon 28
    const { start, end } = windowFor("weekly", "2026-09-22", ZONE);
    expect(start.toISODate()).toBe("2026-09-21");
    expect(end.toISODate()).toBe("2026-09-28");
  });
  it("monthly is the calendar month", () => {
    const { start, end } = windowFor("monthly", "2026-09-22", ZONE);
    expect(start.toISODate()).toBe("2026-09-01");
    expect(end.toISODate()).toBe("2026-10-01");
  });
  it("throws on unknown period", () => {
    // @ts-expect-error invalid period
    expect(() => windowFor("yearly", "2026-09-22", ZONE)).toThrow();
  });
});
