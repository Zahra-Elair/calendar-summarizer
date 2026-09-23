from datetime import date
from calsum.sample_data import sample_events
from calsum.windowing import window_for, filter_events


REF = date(2026, 9, 22)  # a Tuesday


def test_returns_events():
    assert len(sample_events(REF)) > 0


def test_daily_window_has_events_on_reference_day():
    start, end = window_for("daily", REF)
    assert len(filter_events(sample_events(REF), start, end)) > 0


def test_weekly_window_has_events():
    start, end = window_for("weekly", REF)
    assert len(filter_events(sample_events(REF), start, end)) >= 3


def test_monthly_window_has_events_across_multiple_days():
    start, end = window_for("monthly", REF)
    monthly = filter_events(sample_events(REF), start, end)
    distinct_days = {e.start.date() for e in monthly}
    assert len(distinct_days) >= 5


def test_all_events_fall_within_reference_month():
    start, end = window_for("monthly", REF)
    for e in sample_events(REF):
        assert start <= e.start.date() < end
