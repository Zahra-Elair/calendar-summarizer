from datetime import datetime, timedelta
from calsum.events import Event


def test_duration_is_end_minus_start():
    e = Event(
        title="Standup",
        start=datetime(2026, 9, 22, 9, 0),
        end=datetime(2026, 9, 22, 9, 30),
    )
    assert e.duration == timedelta(minutes=30)


def test_all_day_event_has_zero_duration():
    e = Event(
        title="Company holiday",
        start=datetime(2026, 9, 22, 0, 0),
        end=datetime(2026, 9, 23, 0, 0),
        all_day=True,
    )
    assert e.duration == timedelta(0)


def test_defaults():
    e = Event(
        title="Focus",
        start=datetime(2026, 9, 22, 10, 0),
        end=datetime(2026, 9, 22, 12, 0),
    )
    assert e.all_day is False
    assert e.location is None
    assert e.attendees == []
    assert e.description is None
