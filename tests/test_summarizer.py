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


import pytest
from google.genai import errors
from calsum.summarizer import (
    summarize,
    MissingAPIKeyError,
    QuotaExceededError,
    SummarizerError,
)


class _FakeResponse:
    def __init__(self, text):
        self.text = text


class _FakeModels:
    def __init__(self, text=None, exc=None):
        self._text = text
        self._exc = exc
        self.calls = 0

    def generate_content(self, **kwargs):
        self.calls += 1
        if self._exc is not None:
            raise self._exc
        return _FakeResponse(self._text)


class _FakeClient:
    def __init__(self, text=None, exc=None):
        self.models = _FakeModels(text=text, exc=exc)


class _FakeAPIError(errors.APIError):
    def __init__(self, code):
        self.code = code
        Exception.__init__(self, f"api error {code}")


def _one_event():
    from datetime import datetime
    from calsum.events import Event
    return [Event(title="Standup", start=datetime(2026, 9, 22, 9, 0), end=datetime(2026, 9, 22, 9, 15))]


def test_empty_events_returns_empty_summary_without_calling_api():
    client = _FakeClient(text="SHOULD NOT BE USED")
    summary = summarize([], "daily", date(2026, 9, 22), date(2026, 9, 23), client=client)
    assert summary.empty is True
    assert client.models.calls == 0
    assert "nothing" in summary.overview.lower()


def test_summarize_calls_client_and_parses_result():
    raw = json.dumps(
        {"overview": "Busy morning.", "key_events": ["09:00 Standup"], "time_breakdown": "0.2h", "highlights": []}
    )
    client = _FakeClient(text=raw)
    summary = summarize(_one_event(), "daily", date(2026, 9, 22), date(2026, 9, 23), client=client)
    assert client.models.calls == 1
    assert summary.overview == "Busy morning."
    assert summary.empty is False


def test_quota_error_is_mapped():
    client = _FakeClient(exc=_FakeAPIError(429))
    with pytest.raises(QuotaExceededError):
        summarize(_one_event(), "daily", date(2026, 9, 22), date(2026, 9, 23), client=client)


def test_other_api_error_is_mapped_to_summarizer_error():
    client = _FakeClient(exc=_FakeAPIError(500))
    with pytest.raises(SummarizerError):
        summarize(_one_event(), "daily", date(2026, 9, 22), date(2026, 9, 23), client=client)


def test_missing_api_key_raises(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(MissingAPIKeyError):
        summarize(_one_event(), "daily", date(2026, 9, 22), date(2026, 9, 23))
