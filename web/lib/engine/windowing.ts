import { DateTime } from "luxon";
import type { Period } from "./types";

export function windowFor(
  period: Period,
  referenceISODate: string,
  zone: string,
): { start: DateTime; end: DateTime } {
  const ref = DateTime.fromISO(referenceISODate, { zone });
  if (!ref.isValid) throw new Error(`Invalid reference date: ${referenceISODate}`);

  switch (period) {
    case "daily":
      return { start: ref.startOf("day"), end: ref.startOf("day").plus({ days: 1 }) };
    case "weekly":
      // Luxon's startOf("week") is Monday (ISO).
      return { start: ref.startOf("week"), end: ref.startOf("week").plus({ weeks: 1 }) };
    case "monthly":
      return { start: ref.startOf("month"), end: ref.startOf("month").plus({ months: 1 }) };
    default:
      throw new Error(`Unknown period: ${period as string}`);
  }
}
