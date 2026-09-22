from calendar import monthrange
from datetime import date, timedelta

from calsum.events import Event


def window_for(period: str, reference: date, week_start: int = 0) -> tuple[date, date]:
    if period == "daily":
        return reference, reference + timedelta(days=1)
    if period == "weekly":
        offset = (reference.weekday() - week_start) % 7
        start = reference - timedelta(days=offset)
        return start, start + timedelta(days=7)
    if period == "monthly":
        start = reference.replace(day=1)
        days_in_month = monthrange(reference.year, reference.month)[1]
        end = start + timedelta(days=days_in_month)
        return start, end
    raise ValueError(f"Unknown period: {period!r}. Expected daily, weekly, or monthly.")


def filter_events(events: list[Event], start_date: date, end_exclusive: date) -> list[Event]:
    included = [
        e
        for e in events
        if e.start.date() < end_exclusive and e.end.date() >= start_date
    ]
    return sorted(included, key=lambda e: e.start)
