import json
from datetime import date, datetime
from calsum.events import Event
from calsum.summary import Summary
from calsum.summarizer import build_prompt, parse_response, total_scheduled_hours


def _ev(title, start, end, **kw):
    return Event(title=title, start=start, end=end, **kw)


def test_total_scheduled_hours_sums_durations():
    events = [
        _ev("a", datetime(2026, 9, 22, 9, 0), datetime(2026, 9, 22, 10, 0)),
        _ev("b", datetime(2026, 9, 22, 11, 0), datetime(2026, 9, 22, 11, 30)),
    ]
    assert total_scheduled_hours(events) == 1.5


def test_all_day_events_excluded_from_hours():
    events = [
        _ev("holiday", datetime(2026, 9, 22, 0, 0), datetime(2026, 9, 23, 0, 0), all_day=True),
    ]
    assert total_scheduled_hours(events) == 0.0


def test_build_prompt_mentions_period_and_events():
    events = [_ev("Standup", datetime(2026, 9, 22, 9, 0), datetime(2026, 9, 22, 9, 15))]
    prompt = build_prompt(events, "daily", date(2026, 9, 22), date(2026, 9, 23))
    assert "daily" in prompt
    assert "Standup" in prompt
    assert "2026-09-22" in prompt
    # The deterministic total is handed to the model so numbers are grounded.
    assert "0.2" in prompt or "0.25" in prompt or "15" in prompt


def test_parse_response_builds_summary_from_json():
    raw = json.dumps(
        {
            "overview": "A light day.",
            "key_events": ["09:00 Standup"],
            "time_breakdown": "~0.2h in meetings",
            "highlights": ["Nothing urgent"],
        }
    )
    summary = parse_response(raw, "daily", date(2026, 9, 22), date(2026, 9, 23))
    assert isinstance(summary, Summary)
    assert summary.period == "daily"
    assert summary.start == date(2026, 9, 22)
    assert summary.overview == "A light day."
    assert summary.key_events == ["09:00 Standup"]
    assert summary.highlights == ["Nothing urgent"]
    assert summary.empty is False


def test_parse_response_tolerates_code_fenced_json():
    raw = "```json\n{\"overview\": \"x\", \"key_events\": [], \"time_breakdown\": \"\", \"highlights\": []}\n```"
    summary = parse_response(raw, "weekly", date(2026, 9, 21), date(2026, 9, 28))
    assert summary.overview == "x"
