# Calendar Summarizer Engine (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI that prints a high-quality, AI-generated daily/weekly/monthly summary of a sample calendar, with the AI provider isolated behind one component.

**Architecture:** Five small, single-purpose components — an `Event` model, a sample-data provider, deterministic period windowing, a Gemini-backed summarizer, and a CLI that wires them together. Data flows: sample events → windowing filters to the period → summarizer builds a prompt and calls Gemini → structured `Summary` → CLI renders text. The summarizer is the only component that imports the LLM SDK, so the provider can be swapped without touching anything else.

**Tech Stack:** Python 3.11+, `google-genai` SDK (Gemini free tier, model `gemini-2.0-flash`), `pytest`, `argparse`, `setuptools` (src layout).

**Spec:** `docs/superpowers/specs/2026-09-22-calendar-summarizer-engine-design.md`

## Global Constraints

- Python 3.11+ (uses `X | None` type syntax and stdlib only beyond `google-genai`).
- AI provider: **Google Gemini free tier** via `google-genai`; model id from env var `CALSUM_MODEL` (default `gemini-2.0-flash`).
- API key from env var `GEMINI_API_KEY`. Never hard-code or log the key.
- Package name: `calsum`, src layout under `src/calsum/`. Console script: `calsum`.
- The summarizer is the ONLY module allowed to import `google.genai`.
- Windowing is pure/deterministic — no AI, no network.
- All windowing date ranges are `[start_date, end_exclusive_date)` — end is exclusive.
- TDD throughout: failing test first, then minimal implementation. Commit after each task.

---

## File Structure

```
calendar summarizer/
├── pyproject.toml                 # metadata, deps, pytest config, console script
├── src/calsum/
│   ├── __init__.py
│   ├── events.py                  # Event dataclass + duration
│   ├── sample_data.py             # sample_events(reference) -> list[Event]
│   ├── windowing.py               # window_for(), filter_events()
│   ├── summary.py                 # Summary dataclass
│   ├── summarizer.py              # build_prompt, parse_response, summarize, errors
│   └── cli.py                     # main(), render_summary()
└── tests/
    ├── test_events.py
    ├── test_windowing.py
    ├── test_sample_data.py
    ├── test_summarizer.py
    └── test_cli.py
```

---

### Task 1: Project scaffold + `Event` model

**Files:**
- Create: `pyproject.toml`
- Create: `src/calsum/__init__.py`
- Create: `src/calsum/events.py`
- Test: `tests/test_events.py`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `Event` dataclass with fields `title: str`, `start: datetime`, `end: datetime`, `all_day: bool = False`, `location: str | None = None`, `attendees: list[str] = []`, `description: str | None = None`.
  - `Event.duration -> timedelta` property (`timedelta(0)` when `all_day`).

- [ ] **Step 1: Create `pyproject.toml`**

```toml
[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[project]
name = "calsum"
version = "0.1.0"
description = "AI calendar summarizer (daily/weekly/monthly)"
requires-python = ">=3.11"
dependencies = ["google-genai>=0.3"]

[project.optional-dependencies]
dev = ["pytest>=8"]

[project.scripts]
calsum = "calsum.cli:main"

[tool.setuptools.packages.find]
where = ["src"]

[tool.pytest.ini_options]
pythonpath = ["src"]
testpaths = ["tests"]
```

- [ ] **Step 2: Create empty `src/calsum/__init__.py`**

```python
```

- [ ] **Step 3: Write the failing test** in `tests/test_events.py`

```python
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
```

- [ ] **Step 4: Install and run test to verify it fails**

Run: `python -m pip install -e ".[dev]" && python -m pytest tests/test_events.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'calsum.events'`

- [ ] **Step 5: Write minimal implementation** in `src/calsum/events.py`

```python
from dataclasses import dataclass, field
from datetime import datetime, timedelta


@dataclass
class Event:
    title: str
    start: datetime
    end: datetime
    all_day: bool = False
    location: str | None = None
    attendees: list[str] = field(default_factory=list)
    description: str | None = None

    @property
    def duration(self) -> timedelta:
        if self.all_day:
            return timedelta(0)
        return self.end - self.start
```

- [ ] **Step 6: Run test to verify it passes**

Run: `python -m pytest tests/test_events.py -v`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add pyproject.toml src/calsum/__init__.py src/calsum/events.py tests/test_events.py
git commit -m "feat: project scaffold and Event model"
```

---

### Task 2: Period windowing

**Files:**
- Create: `src/calsum/windowing.py`
- Test: `tests/test_windowing.py`

**Interfaces:**
- Consumes: `Event` (from `calsum.events`).
- Produces:
  - `window_for(period: str, reference: date, week_start: int = 0) -> tuple[date, date]` — returns `(start_date, end_exclusive_date)`. `period` is one of `"daily"`, `"weekly"`, `"monthly"`. `week_start` is a weekday int (0 = Monday). Raises `ValueError` on an unknown period.
  - `filter_events(events: list[Event], start_date: date, end_exclusive: date) -> list[Event]` — events whose date range overlaps `[start_date, end_exclusive)`, sorted by `start`.

- [ ] **Step 1: Write the failing test** in `tests/test_windowing.py`

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_windowing.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'calsum.windowing'`

- [ ] **Step 3: Write minimal implementation** in `src/calsum/windowing.py`

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_windowing.py -v`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/calsum/windowing.py tests/test_windowing.py
git commit -m "feat: deterministic period windowing and event filtering"
```

---

### Task 3: Sample data provider

**Files:**
- Create: `src/calsum/sample_data.py`
- Test: `tests/test_sample_data.py`

**Interfaces:**
- Consumes: `Event` (from `calsum.events`), `window_for`/`filter_events` (from `calsum.windowing`, in tests).
- Produces:
  - `sample_events(reference: date) -> list[Event]` — a believable set of events spanning the full calendar month that contains `reference`, so daily, weekly, and monthly windows are all non-empty.

- [ ] **Step 1: Write the failing test** in `tests/test_sample_data.py`

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_sample_data.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'calsum.sample_data'`

- [ ] **Step 3: Write minimal implementation** in `src/calsum/sample_data.py`

Anchor events to the Monday of the reference week and spread believable events across the month. The helper builds events at specific weekday offsets from the first Monday on/after the month start.

```python
from datetime import date, datetime, time, timedelta

from calsum.events import Event


def _at(day: date, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute))


def sample_events(reference: date) -> list[Event]:
    """A believable month of calendar events anchored on the reference month."""
    month_start = reference.replace(day=1)
    # First Monday on or after the month start.
    first_monday = month_start + timedelta(days=(0 - month_start.weekday()) % 7)

    events: list[Event] = []

    # Four weeks of recurring + one-off events.
    for week in range(4):
        monday = first_monday + timedelta(weeks=week)
        tuesday = monday + timedelta(days=1)
        wednesday = monday + timedelta(days=2)
        thursday = monday + timedelta(days=3)
        friday = monday + timedelta(days=4)

        # Daily standup Mon-Fri.
        for offset in range(5):
            day = monday + timedelta(days=offset)
            events.append(
                Event(
                    title="Team standup",
                    start=_at(day, 9, 0),
                    end=_at(day, 9, 15),
                    attendees=["Team"],
                )
            )

        events.append(
            Event(
                title="1:1 with manager",
                start=_at(monday, 11, 0),
                end=_at(monday, 11, 30),
                attendees=["Priya"],
            )
        )
        events.append(
            Event(
                title="Focus block: feature work",
                start=_at(tuesday, 10, 0),
                end=_at(tuesday, 12, 30),
            )
        )
        events.append(
            Event(
                title="Design review",
                start=_at(wednesday, 14, 0),
                end=_at(wednesday, 15, 0),
                attendees=["Design", "Eng"],
                location="Room 4B",
            )
        )
        events.append(
            Event(
                title="Sprint planning",
                start=_at(thursday, 13, 0),
                end=_at(thursday, 14, 30),
                attendees=["Team"],
            )
        )
        events.append(
            Event(
                title="Gym",
                start=_at(friday, 18, 0),
                end=_at(friday, 19, 0),
            )
        )

    # A few one-off personal / notable events during the reference week.
    week_monday = reference - timedelta(days=reference.weekday())
    events.append(
        Event(
            title="Dentist appointment",
            start=_at(week_monday + timedelta(days=2), 8, 0),
            end=_at(week_monday + timedelta(days=2), 8, 45),
            location="Downtown Dental",
        )
    )
    events.append(
        Event(
            title="Product launch review",
            start=_at(week_monday + timedelta(days=3), 15, 30),
            end=_at(week_monday + timedelta(days=3), 17, 0),
            attendees=["Leadership", "Marketing", "Eng"],
            description="Go/no-go for the Q4 launch.",
        )
    )

    # Keep only events inside the reference month.
    month_end = _next_month_start(month_start)
    return [e for e in events if month_start <= e.start.date() < month_end]


def _next_month_start(month_start: date) -> date:
    if month_start.month == 12:
        return date(month_start.year + 1, 1, 1)
    return date(month_start.year, month_start.month + 1, 1)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_sample_data.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/calsum/sample_data.py tests/test_sample_data.py
git commit -m "feat: realistic sample calendar data provider"
```

---

### Task 4: `Summary` model + prompt building + response parsing

**Files:**
- Create: `src/calsum/summary.py`
- Create: `src/calsum/summarizer.py` (partial — pure functions only in this task)
- Test: `tests/test_summarizer.py` (prompt + parse + helpers here)

**Interfaces:**
- Consumes: `Event` (from `calsum.events`).
- Produces:
  - `Summary` dataclass: `period: str`, `start: date`, `end: date`, `overview: str`, `key_events: list[str]`, `time_breakdown: str`, `highlights: list[str]`, `empty: bool = False`.
  - `total_scheduled_hours(events: list[Event]) -> float` (rounded to 1 decimal).
  - `build_prompt(events: list[Event], period: str, start: date, end: date) -> str`.
  - `parse_response(raw: str, period: str, start: date, end: date) -> Summary` — parses the model's JSON into a `Summary`.

- [ ] **Step 1: Write the failing test** in `tests/test_summarizer.py`

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_summarizer.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'calsum.summary'`

- [ ] **Step 3: Write `src/calsum/summary.py`**

```python
from dataclasses import dataclass, field
from datetime import date


@dataclass
class Summary:
    period: str
    start: date
    end: date
    overview: str
    key_events: list[str] = field(default_factory=list)
    time_breakdown: str = ""
    highlights: list[str] = field(default_factory=list)
    empty: bool = False
```

- [ ] **Step 4: Write the pure functions in `src/calsum/summarizer.py`**

```python
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest tests/test_summarizer.py -v`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/calsum/summary.py src/calsum/summarizer.py tests/test_summarizer.py
git commit -m "feat: Summary model, prompt building, and response parsing"
```

---

### Task 5: Summarizer integration (Gemini call, errors, empty handling)

**Files:**
- Modify: `src/calsum/summarizer.py` (add `summarize`, error classes, client factory)
- Test: `tests/test_summarizer.py` (add integration-style tests with a fake client)

**Interfaces:**
- Consumes: `build_prompt`, `parse_response`, `total_scheduled_hours` (Task 4); `Event`, `Summary`.
- Produces:
  - Exceptions: `SummarizerError(Exception)`, `MissingAPIKeyError(SummarizerError)`, `QuotaExceededError(SummarizerError)`.
  - `summarize(events, period, start, end, *, client=None, model=None) -> Summary`. Empty `events` returns a friendly summary with `empty=True` and NO API call. A `client` may be injected (duck-typed: `client.models.generate_content(model=..., contents=...)` returning an object with a `.text` attribute) — used in tests. When `client is None`, one is built from `GEMINI_API_KEY`.

- [ ] **Step 1: Write the failing tests** — append to `tests/test_summarizer.py`

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_summarizer.py -v`
Expected: FAIL — `ImportError: cannot import name 'summarize'` (and the error classes)

- [ ] **Step 3: Add the implementation to `src/calsum/summarizer.py`**

Add these imports at the top (keep the existing `import json`):

```python
import os

from google import genai
from google.genai import errors
```

Add at the end of the file:

```python
class SummarizerError(Exception):
    """Base error for the summarizer."""


class MissingAPIKeyError(SummarizerError):
    """GEMINI_API_KEY is not set."""


class QuotaExceededError(SummarizerError):
    """The free-tier quota/rate limit was hit."""


DEFAULT_MODEL = "gemini-2.0-flash"


def _empty_summary(period: str, start: date, end: date) -> Summary:
    return Summary(
        period=period,
        start=start,
        end=end,
        overview="Nothing scheduled for this period.",
        key_events=[],
        time_breakdown="0h scheduled",
        highlights=[],
        empty=True,
    )


def _make_client() -> "genai.Client":
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise MissingAPIKeyError(
            "GEMINI_API_KEY is not set. Get a free key at "
            "https://aistudio.google.com/apikey and export GEMINI_API_KEY."
        )
    return genai.Client(api_key=api_key)


def summarize(
    events: list[Event],
    period: str,
    start: date,
    end: date,
    *,
    client=None,
    model: str | None = None,
) -> Summary:
    if not events:
        return _empty_summary(period, start, end)

    if client is None:
        client = _make_client()
    model = model or os.environ.get("CALSUM_MODEL", DEFAULT_MODEL)

    prompt = build_prompt(events, period, start, end)
    try:
        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config={"response_mime_type": "application/json"},
        )
    except errors.APIError as exc:
        if getattr(exc, "code", None) == 429:
            raise QuotaExceededError(
                "Gemini free-tier quota/rate limit reached. Wait a bit and retry."
            ) from exc
        raise SummarizerError(f"Gemini API error: {exc}") from exc

    return parse_response(response.text, period, start, end)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_summarizer.py -v`
Expected: PASS (all summarizer tests, 10 total)

- [ ] **Step 5: Commit**

```bash
git add src/calsum/summarizer.py tests/test_summarizer.py
git commit -m "feat: Gemini-backed summarize() with error mapping and empty handling"
```

---

### Task 6: CLI

**Files:**
- Create: `src/calsum/cli.py`
- Test: `tests/test_cli.py`

**Interfaces:**
- Consumes: `sample_events` (Task 3), `window_for`/`filter_events` (Task 2), `summarize` and error classes (Task 5), `Summary` (Task 4).
- Produces:
  - `render_summary(summary: Summary) -> str` — human-readable text.
  - `main(argv: list[str] | None = None) -> int` — parses `--period {daily,weekly,monthly}` (required) and `--date YYYY-MM-DD` (optional, default today); returns exit codes: 0 success, 1 generic API error, 2 missing key, 3 quota, 4 bad arguments. Accepts an injected summarizer via `_run` for testing (see below).

- [ ] **Step 1: Write the failing test** in `tests/test_cli.py`

```python
from datetime import date, datetime
from calsum.summary import Summary
from calsum.summarizer import MissingAPIKeyError, QuotaExceededError
from calsum import cli


def _fake_summarize_ok(events, period, start, end):
    return Summary(
        period=period, start=start, end=end,
        overview="A busy Tuesday.",
        key_events=["09:00 Standup"],
        time_breakdown="~2h meetings",
        highlights=["Launch review needs prep"],
    )


def test_render_summary_includes_sections():
    s = _fake_summarize_ok([], "daily", date(2026, 9, 22), date(2026, 9, 23))
    text = cli.render_summary(s)
    assert "A busy Tuesday." in text
    assert "09:00 Standup" in text
    assert "Launch review needs prep" in text


def test_main_success_prints_summary(capsys):
    code = cli.main(["--period", "daily", "--date", "2026-09-22"], summarize_fn=_fake_summarize_ok)
    out = capsys.readouterr().out
    assert code == 0
    assert "A busy Tuesday." in out


def test_main_rejects_bad_period(capsys):
    code = cli.main(["--period", "yearly"], summarize_fn=_fake_summarize_ok)
    assert code == 4


def test_main_rejects_bad_date():
    code = cli.main(["--period", "daily", "--date", "not-a-date"], summarize_fn=_fake_summarize_ok)
    assert code == 4


def test_main_missing_key_returns_2(capsys):
    def boom(*a, **k):
        raise MissingAPIKeyError("no key")
    code = cli.main(["--period", "daily"], summarize_fn=boom)
    err = capsys.readouterr().err
    assert code == 2
    assert "no key" in err


def test_main_quota_returns_3():
    def boom(*a, **k):
        raise QuotaExceededError("slow down")
    code = cli.main(["--period", "daily"], summarize_fn=boom)
    assert code == 3
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_cli.py -v`
Expected: FAIL — `AttributeError: module 'calsum.cli' has no attribute 'render_summary'`

- [ ] **Step 3: Write minimal implementation** in `src/calsum/cli.py`

```python
import argparse
import sys
from datetime import date, datetime

from calsum.sample_data import sample_events
from calsum.summarizer import (
    MissingAPIKeyError,
    QuotaExceededError,
    SummarizerError,
    summarize,
)
from calsum.summary import Summary
from calsum.windowing import filter_events, window_for

PERIODS = ("daily", "weekly", "monthly")


def render_summary(summary: Summary) -> str:
    lines = [
        f"{summary.period.capitalize()} summary "
        f"({summary.start.isoformat()} to {summary.end.isoformat()})",
        "=" * 48,
        "",
        summary.overview,
        "",
        "Key events:",
    ]
    lines += [f"  - {item}" for item in summary.key_events] or ["  (none)"]
    lines += ["", f"Time: {summary.time_breakdown}", "", "Highlights:"]
    lines += [f"  - {item}" for item in summary.highlights] or ["  (none)"]
    return "\n".join(lines)


def _parse_args(argv):
    parser = argparse.ArgumentParser(prog="calsum", description="AI calendar summarizer")
    parser.add_argument("--period", required=True, choices=PERIODS)
    parser.add_argument("--date", default=None, help="Reference date YYYY-MM-DD (default: today)")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None, summarize_fn=summarize) -> int:
    try:
        args = _parse_args(argv)
    except SystemExit:
        return 4

    if args.date is None:
        reference = date.today()
    else:
        try:
            reference = datetime.strptime(args.date, "%Y-%m-%d").date()
        except ValueError:
            print(f"Invalid --date {args.date!r}; expected YYYY-MM-DD.", file=sys.stderr)
            return 4

    start, end = window_for(args.period, reference)
    events = filter_events(sample_events(reference), start, end)

    try:
        summary = summarize_fn(events, args.period, start, end)
    except MissingAPIKeyError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except QuotaExceededError as exc:
        print(str(exc), file=sys.stderr)
        return 3
    except SummarizerError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print(render_summary(summary))
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_cli.py -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the full suite**

Run: `python -m pytest -v`
Expected: PASS (all tests across the 5 test files)

- [ ] **Step 6: Commit**

```bash
git add src/calsum/cli.py tests/test_cli.py
git commit -m "feat: CLI wiring, rendering, and exit codes"
```

---

### Task 7: README + manual live verification

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: the finished CLI.
- Produces: usage docs. No new code interfaces.

- [ ] **Step 1: Write `README.md`**

````markdown
# calsum — AI Calendar Summarizer (Phase 1)

Generate a daily / weekly / monthly natural-language summary of a calendar,
powered by the free tier of Google Gemini. Phase 1 runs against built-in sample
calendar data — no sign-in required.

## Setup

```bash
python -m pip install -e ".[dev]"
export GEMINI_API_KEY=your_free_key   # from https://aistudio.google.com/apikey
```

## Usage

```bash
calsum --period daily
calsum --period weekly --date 2026-09-22
calsum --period monthly
```

Optional: `export CALSUM_MODEL=gemini-2.0-flash` to change the model.

## Tests

```bash
python -m pytest
```

Unit tests mock the model, so they need no API key and cost nothing.
````

- [ ] **Step 2: Manual live check (requires a real key)**

Run: `export GEMINI_API_KEY=... && calsum --period weekly --date 2026-09-22`
Expected: a printed weekly summary with overview, key events, time, and highlights.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup, usage, and testing"
```

---

## Notes for the implementer

- Run `python -m pip install -e ".[dev]"` once (Task 1) so `calsum` and `google-genai` are importable; tests import `google.genai` even though they mock it.
- Unit tests never hit the network or need `GEMINI_API_KEY` (the client is injected or the empty path is taken). Only the manual check in Task 7 makes a real API call.
- Keep the `google.genai` import confined to `summarizer.py`.
