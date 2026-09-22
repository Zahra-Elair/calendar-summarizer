import json
from datetime import date

from calsum.events import Event
from calsum.summary import Summary


def total_scheduled_hours(events: list[Event]) -> float:
    seconds = sum(e.duration.total_seconds() for e in events)
    return round(seconds / 3600, 1)


def _format_event(e: Event) -> str:
    when = e.start.strftime("%a %Y-%m-%d %H:%M") + "-" + e.end.strftime("%H:%M")
    parts = [when, e.title]
    if e.location:
        parts.append(f"@ {e.location}")
    if e.attendees:
        parts.append("with " + ", ".join(e.attendees))
    return " | ".join(parts)


def build_prompt(events: list[Event], period: str, start: date, end: date) -> str:
    lines = [_format_event(e) for e in events]
    events_block = "\n".join(lines) if lines else "(no events)"
    hours = total_scheduled_hours(events)
    return (
        f"You are a helpful assistant that summarizes a person's calendar.\n"
        f"Write a {period} summary for the period {start.isoformat()} "
        f"(inclusive) to {end.isoformat()} (exclusive).\n\n"
        f"Total scheduled hours in this period (computed for you, use it — do not "
        f"invent numbers): {hours}\n"
        f"Number of events: {len(events)}\n\n"
        f"Events:\n{events_block}\n\n"
        f"For a daily summary be concrete and time-ordered. For weekly or monthly, "
        f"zoom out to themes, busiest days, and overall load rather than listing "
        f"every event.\n\n"
        f"Respond ONLY with a JSON object with exactly these keys:\n"
        f'  "overview": string (1-2 sentences),\n'
        f'  "key_events": array of short strings,\n'
        f'  "time_breakdown": string,\n'
        f'  "highlights": array of short strings (conflicts, long days, prep needed).\n'
    )


def _strip_code_fence(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text
        if text.endswith("```"):
            text = text[: text.rfind("```")]
    return text.strip()


def parse_response(raw: str, period: str, start: date, end: date) -> Summary:
    data = json.loads(_strip_code_fence(raw))
    return Summary(
        period=period,
        start=start,
        end=end,
        overview=data.get("overview", ""),
        key_events=list(data.get("key_events", [])),
        time_breakdown=data.get("time_breakdown", ""),
        highlights=list(data.get("highlights", [])),
    )
