# Calendar Summarizer — Phase 1: AI Summarizer Engine (Design Spec)

**Date:** 2026-09-22
**Status:** Approved for implementation planning
**Scope of this spec:** Phase 1 only (the AI summarizer engine). Later phases are described for context but specified separately.

---

## 1. Product vision (context)

A hosted, multi-user platform where any visitor signs in with their **Google
account**, connects their Google Calendar, chooses which periodic summaries they
want (daily / weekly / monthly), and receives AI-generated summaries of their
events on a schedule. Built as a **portfolio piece**, so it must be easy for a
visitor to experience and must showcase a clean, modern AI workflow.

### 1.1 Full platform, decomposed

The platform is too large for a single spec. It is split into independently
shippable pieces, each with its own spec → plan → build cycle:

1. **Core AI summarizer (engine)** — events + period → great summary via Claude. *(This spec.)*
2. **Google Calendar integration** — Google OAuth sign-in + pull events for a date range.
3. **Web app + accounts** — landing page, "Sign in with Google," dashboard, user records.
4. **Preferences** — user chooses which summaries and delivery time.
5. **Scheduler + delivery** — per-user cron jobs generate and send summaries (email).
6. **Deployment** — hosting so it is live for the portfolio.

### 1.2 Build sequence

- **Phase 1 — The engine (this spec).** Build #1 with realistic sample events.
  Produces daily/weekly/monthly summaries, fully testable, no OAuth/hosting.
- **Phase 2 — Live web app.** Wrap the engine: Google sign-in (#2) + web
  dashboard pulling the user's real calendar and showing an on-demand summary (#3).
- **Phase 3 — Scheduling & delivery.** Preferences (#4) + scheduled email delivery (#5).
- Deployment (#6) folds into Phases 2–3.

Each phase yields a working, demoable artifact — ideal for a portfolio, and
never blocked behind infrastructure.

---

## 2. Phase 1 goal

`calsum --period weekly` prints a high-quality, structured summary of a sample
calendar. The engine is the reusable core that Phases 2–3 call into. Pure logic:
**no OAuth, no web server, no database, no scheduling, no email.**

---

## 3. Architecture

Five small, single-purpose, independently testable components.

### 3.1 `Event` model

A normalized calendar event. Every future provider (Google, etc.) maps *into*
this shape, so the summarizer never knows where events came from — this boundary
is what keeps Phase 2 clean.

Fields:

| Field | Type | Notes |
|-------|------|-------|
| `title` | str | Event summary/subject |
| `start` | datetime (tz-aware) | Start time |
| `end` | datetime (tz-aware) | End time |
| `all_day` | bool | True for all-day events |
| `location` | str \| None | Optional |
| `attendees` | list[str] | Names or emails; may be empty |
| `description` | str \| None | Optional |

Derived: `duration` (end − start; zero/ignored for all-day).

### 3.2 Sample data provider

A realistic fixture set of events representing a believable work-life calendar
(standups, 1:1s, focus blocks, a dentist appointment, a launch review, etc.),
spanning enough days to demo daily, weekly, and monthly views. Ships in the repo
so anyone can run the demo with zero setup. Dates are generated **relative to a
reference date** so the sample always looks current.

### 3.3 Period windowing

Given a period type (`daily` / `weekly` / `monthly`) and a reference date,
compute the `[start, end)` date range and filter events into that window. Pure,
deterministic date math — **no AI**. Rules:

- `daily` — the reference calendar day.
- `weekly` — the week containing the reference date (week start configurable;
  default Monday).
- `monthly` — the calendar month containing the reference date.
- An event is included if it overlaps the window (handles events spanning
  midnight and multi-day events).

### 3.4 Summarizer (the AI step)

The only component that touches the LLM SDK. Takes windowed events + period type,
builds a structured prompt, calls the model, returns a structured summary object.
Because it is the sole AI boundary, the provider can be swapped without touching
any other component.

- **Provider:** **Google Gemini (free tier)** — no cost to run, and the same
  Google account/cloud project used for Google Calendar in later phases.
- **SDK:** `google-genai` (`from google import genai`).
- **Model:** `gemini-2.0-flash` (free tier). Model id read from an env var
  (default `gemini-2.0-flash`) so it can be changed without code edits; exact
  free-tier model name confirmed at implementation time.
- **Auth:** `GEMINI_API_KEY` (env var).
- **Structured output:** request JSON matching the summary schema (§4) via
  Gemini's structured-output / `response_mime_type: application/json` support, so
  the result parses directly into the summary object.
- Prompt includes: the period type, the date range, and a compact rendering of
  the windowed events (title, start/end, duration, location, attendees).
- Returns a structured object (see §4), not just a raw string, so later phases
  can render HTML/email without re-calling the model.

### 3.5 CLI entry point

`calsum --period {daily|weekly|monthly} [--date YYYY-MM-DD]`

Wires sample data → windowing → summarizer → prints formatted text. `--date`
defaults to today. Phases 2–3 call the summarizer function directly rather than
through the CLI.

### 3.6 Data flow

```
sample events → windowing (filter to period) → summarizer (prompt → Claude)
    → structured summary → CLI formats & prints
```

---

## 4. Output format

The summarizer returns a structured summary object with these fields, rendered by
the CLI as clean text:

- **overview** — 1–2 sentence read on the period
  (e.g. "A meeting-heavy Tuesday with limited focus time; the afternoon is
  back-to-back.").
- **key_events** — the events that matter, with times — curated, not an
  exhaustive dump.
- **time_breakdown** — rough split of the period computed from event durations
  (e.g. "~4h meetings, 2h focus, 1h personal").
- **highlights** — things worth attention: conflicts, an unusually long day, a
  meeting likely needing prep.

Period-specific behavior:

- **daily** — concrete and time-ordered.
- **weekly** — zooms out to themes, busiest days, overall load; does not list
  every event.
- **monthly** — higher-level: recurring commitments, notable weeks, overall
  shape of the month.

The `time_breakdown` durations are computed deterministically from event data and
provided to the model, so the numbers are grounded rather than hallucinated.

---

## 5. Error handling

- **Empty window** (no events) → **skip the API call**, return a friendly
  "Nothing scheduled" summary. Saves tokens; handles empty days gracefully.
- **Missing `GEMINI_API_KEY`** → clear, actionable startup error, not a stack
  trace.
- **API failure** (network, rate limit / free-tier quota exhausted, blocked
  response) → catch specific SDK exceptions (most-specific-first chain), surface
  a readable message; CLI exits non-zero so a future scheduler can detect
  failure. Free-tier rate limits are expected, so quota errors get a distinct,
  friendly message.
- **Invalid `--date` / `--period`** → validated with a clear usage message.

---

## 6. Testing (TDD)

Tests are written before implementation.

- **Windowing** — the richest suite: daily/weekly/monthly boundaries, events
  spanning midnight, all-day events, empty windows, month/week edges.
  Deterministic, no API, no mocks.
- **Event model** — construction, duration calculation, validation.
- **Summarizer** — the Gemini client is **mocked**: assert the prompt is built
  correctly from windowed events and that the response is parsed into the summary
  object.
  Fast, free, deterministic. Plus one optional, clearly-marked **live**
  integration test that actually calls the API — run manually, excluded from CI.
- **CLI** — argument parsing and the empty-window path.

---

## 7. Out of scope for Phase 1 (YAGNI)

No Google auth, no web server, no database, no scheduling, no email delivery, no
multi-user anything. Those are Phases 2–3. Phase 1 is done when
`calsum --period weekly` prints a great summary of the sample calendar and the
test suite is green.

---

## 8. Tech stack

- **Language:** Python (3.11+).
- **AI:** Google Gemini (free tier) via the `google-genai` SDK, model
  `gemini-2.0-flash`. `GEMINI_API_KEY` env var.
- **Calendar provider (later phases):** Google Calendar only, provider-agnostic
  `Event` boundary from Phase 1.
- **Interface (this phase):** CLI.
- **Testing:** `pytest`.
