from datetime import date, datetime
import pytest
from calsum.events import Event
from calsum.windowing import window_for, filter_events


def test_daily_window_is_one_day():
    assert window_for("daily", date(2026, 9, 22)) == (date(2026, 9, 22), date(2026, 9, 23))


def test_weekly_window_starts_monday():
    # 2026-09-22 is a Tuesday; week is Mon 21 .. next Mon 28
    assert window_for("weekly", date(2026, 9, 22)) == (date(2026, 9, 21), date(2026, 9, 28))


def test_monthly_window_is_calendar_month():
    assert window_for("monthly", date(2026, 9, 22)) == (date(2026, 9, 1), date(2026, 10, 1))


def test_monthly_window_handles_december_rollover():
    assert window_for("monthly", date(2026, 12, 15)) == (date(2026, 12, 1), date(2027, 1, 1))


def test_unknown_period_raises():
    with pytest.raises(ValueError):
        window_for("yearly", date(2026, 9, 22))


def _ev(title, start, end):
    return Event(title=title, start=start, end=end)


def test_filter_includes_only_events_in_window():
    events = [
        _ev("before", datetime(2026, 9, 20, 9, 0), datetime(2026, 9, 20, 10, 0)),
        _ev("inside", datetime(2026, 9, 22, 9, 0), datetime(2026, 9, 22, 10, 0)),
        _ev("after", datetime(2026, 9, 25, 9, 0), datetime(2026, 9, 25, 10, 0)),
    ]
    result = filter_events(events, date(2026, 9, 22), date(2026, 9, 23))
    assert [e.title for e in result] == ["inside"]


def test_filter_includes_event_spanning_midnight_into_window():
    events = [_ev("overnight", datetime(2026, 9, 21, 23, 0), datetime(2026, 9, 22, 1, 0))]
    result = filter_events(events, date(2026, 9, 22), date(2026, 9, 23))
    assert [e.title for e in result] == ["overnight"]


def test_filter_returns_sorted_by_start():
    events = [
        _ev("late", datetime(2026, 9, 22, 15, 0), datetime(2026, 9, 22, 16, 0)),
        _ev("early", datetime(2026, 9, 22, 9, 0), datetime(2026, 9, 22, 10, 0)),
    ]
    result = filter_events(events, date(2026, 9, 22), date(2026, 9, 23))
    assert [e.title for e in result] == ["early", "late"]


def test_filter_empty_window_returns_empty():
    events = [_ev("x", datetime(2026, 9, 20, 9, 0), datetime(2026, 9, 20, 10, 0))]
    assert filter_events(events, date(2026, 9, 22), date(2026, 9, 23)) == []
