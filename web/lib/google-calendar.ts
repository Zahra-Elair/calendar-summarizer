import { windowFor } from "./engine/windowing";
import type { CalEvent, Period } from "./engine/types";

export interface GoogleEvent {
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email?: string; displayName?: string }[];
}

export function mapGoogleEvent(raw: GoogleEvent): CalEvent {
  const allDay = Boolean(raw.start?.date && !raw.start?.dateTime);
  const startStr = raw.start?.dateTime ?? raw.start?.date ?? "";
  const endStr = raw.end?.dateTime ?? raw.end?.date ?? startStr;
  return {
    title: raw.summary?.trim() || "(no title)",
    start: new Date(startStr),
    end: new Date(endStr),
    allDay,
    location: raw.location,
    attendees: (raw.attendees ?? []).map((a) => a.email ?? a.displayName ?? "").filter(Boolean),
    description: raw.description,
  };
}

export async function fetchCalendarEvents(
  accessToken: string, period: Period, referenceISODate: string, zone: string,
): Promise<{ events: CalEvent[]; startISO: string; endISO: string }> {
  const { start, end } = windowFor(period, referenceISODate, zone);
  const params = new URLSearchParams({
    timeMin: start.toISO()!,
    timeMax: end.toISO()!,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
  );

  if (res.status === 401) {
    const e = new Error("Calendar authorization expired.");
    (e as { code?: string }).code = "AUTH_EXPIRED";
    throw e;
  }
  if (res.status === 403) {
    // The user signed in but did not grant the calendar.readonly scope.
    const e = new Error("Calendar access was not granted.");
    (e as { code?: string }).code = "SCOPE_DENIED";
    throw e;
  }
  if (!res.ok) throw new Error(`Calendar API error: ${res.status}`);
  const data = (await res.json()) as { items?: GoogleEvent[] };
  const events = (data.items ?? []).map(mapGoogleEvent);
  return { events, startISO: start.toISODate()!, endISO: end.toISODate()! };
}
