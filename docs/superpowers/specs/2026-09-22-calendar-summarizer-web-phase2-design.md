# Calendar Summarizer — Phase 2: Web App + Google Calendar (Design Spec)

**Date:** 2026-09-22
**Status:** Approved for implementation planning
**Builds on:** Phase 1 (Python `calsum` engine + CLI) —
`docs/superpowers/specs/2026-09-22-calendar-summarizer-engine-design.md`

---

## 1. Goal

A **Next.js (TypeScript, App Router)** web app where a user signs in with
Google, the app reads their real **Google Calendar**, and displays an
AI-generated **daily / weekly / monthly** summary on demand. Session-based
(encrypted JWT cookie), **no database**. The Phase 1 engine is re-implemented in
TypeScript so the whole app is a single deployable unit.

Phase 2 does **not** include: persistent user accounts, saved preferences,
scheduled/email delivery, or public (verified-app) access. Those remain Phase 3.

---

## 2. Product context

Original platform vision: a hosted, multi-user calendar-summary platform. It is
built in phases, each independently demoable:

- **Phase 1 (done):** AI summarizer engine + CLI over sample data (Python, Gemini
  free tier). Shipped to `github.com/Zahra-Elair/calendar-summarizer`.
- **Phase 2 (this spec):** sign in with Google + on-demand web summaries of the
  user's real calendar. Session-based, no DB.
- **Phase 3 (later):** persistent accounts, saved preferences, scheduled email
  delivery, and public app verification.

---

## 3. Repository restructure

The single repo is reorganized into clear top-level folders:

```
calendar-summarizer/
├── docs/                 # specs & plans (project-wide, unchanged, stays at root)
├── python-cli/           # Phase 1 moves here: src/, tests/, pyproject.toml, README, .env.example
├── web/                  # Phase 2 Next.js app
└── README.md             # project overview linking to python-cli/ and web/
```

- The Phase 1 Python (engine + CLI) is **relocated unchanged**; its
  `pyproject.toml` (`pythonpath=["src"]`, `testpaths=["tests"]`) continues to
  work when run from `python-cli/`. Its test suite must still pass after the move.
- `docs/` stays at the repo root (covers the whole platform).
- The root `.env` (the user's live key, gitignored) is left in place; the web app
  uses its own `web/.env.local`.

---

## 4. Architecture & request flow

All sensitive work runs **server-side**; the Gemini key and the Google access
token never reach the browser.

```
Browser
  → Sign in (Auth.js / Google)                     [OAuth]
  → Dashboard page (server component)
  → user picks period (+ optional date)
  → Server Action / route handler (server-side):
        read Google access token from session
        → fetch Google Calendar events in the window
        → map to Event[]
        → summarize(events, period, start, end)     [ported TS engine → Gemini]
        → return Summary
  → Dashboard renders the Summary
```

Rejected alternative: calling Gemini from the client would expose the API key in
the browser. All model and calendar calls stay on the server.

### 4.1 Sensitive-scope constraint (must set expectations)

Google treats `calendar.readonly` as a **sensitive scope**. While the Google
Cloud OAuth app is unverified:

- Only **test users explicitly added** in the OAuth consent screen (up to 100)
  can sign in.
- They see an "unverified app" warning they must click through.

This is acceptable for Phase 2 (the owner + a few added test users demo it).
Opening it to any visitor requires Google's app-verification process (privacy
policy, domain verification, review) — **out of scope**, a Phase 3+ concern.

---

## 5. Authentication (Auth.js / NextAuth v5)

- **Provider:** Google. **Session strategy:** JWT (encrypted cookie, no DB).
- **Scopes:** `openid`, `email`, `profile`,
  `https://www.googleapis.com/auth/calendar.readonly`.
- **Token flow:** on sign-in the Google **access token** is stored in the JWT via
  the `jwt` callback and exposed to server code via the `session` callback. It is
  never sent to the browser.
- **Session lifetime:** Google access tokens last ~1 hour. With no DB and no
  refresh-token storage, once the token expires, calendar calls fail and the app
  prompts the user to sign in again. (Refresh-token persistence is Phase 3.)
- **Env (`web/.env.local`, all server-side):** `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, `GEMINI_API_KEY`.
- **Google Cloud redirect URI (local):**
  `http://localhost:3000/api/auth/callback/google`.

---

## 6. Google Calendar fetch

`web/lib/google-calendar.ts`:

- Compute the window `[start, end)` for the requested period via the ported
  `windowFor`.
- Call Calendar API `events.list` on the user's `primary` calendar with
  `timeMin`/`timeMax` = the window, `singleEvents=true` (expands recurring),
  `orderBy=startTime`, using the session access token.
- Map each Google event → the engine `Event` shape, handling:
  - timed events (`start.dateTime` / `end.dateTime`),
  - all-day events (`start.date` / `end.date`, `allDay=true`),
  - `title` (from `summary`), `location`, `attendees` (emails/names),
    `description`.

---

## 7. Engine port to TypeScript

A faithful translation of the Phase 1 Python engine, under `web/lib/engine/`,
so behavior matches:

- `types.ts` — `Event`, `Summary`, `Period` (`"daily" | "weekly" | "monthly"`).
- `windowing.ts` — `windowFor(period, reference)` → `{ start, end }`, the same
  daily/weekly/monthly `[start, end)` math (weekly starts Monday); used to build
  `timeMin`/`timeMax`.
- `prompt.ts` — `buildPrompt(events, period, start, end)` and
  `totalScheduledHours(events)` (pre-computes hours so the model does not invent
  numbers).
- `summarize.ts` — `summarize(events, period, start, end)` → `Summary` via
  `@google/genai`, model `gemini-3.6-flash`, JSON response
  (`responseMimeType: "application/json"`). Guarantees, matching Phase 1:
  - **empty window → returns an empty summary, makes zero API calls;**
  - typed errors: missing key, quota exceeded, blocked/empty response, generic.

Model id configurable via env (default `gemini-3.6-flash`). Key from
`GEMINI_API_KEY`, server-side only.

---

## 8. UI (Next.js App Router + Tailwind)

- **Landing (signed out):** project title, one-line pitch, a single "Sign in with
  Google" button.
- **Dashboard (signed in):** header with the user's name/avatar and a sign-out
  control; a **period selector** (Daily / Weekly / Monthly) with an optional date
  picker (defaults to today); a **Summarize** action; the rendered **Summary** —
  overview, key events, time breakdown, highlights — as clean cards.
- **States:** loading (summarizing), empty ("Nothing scheduled"), and error
  (§9). Responsive, modern styling; a genuinely polished UI is expected at
  implementation time.

---

## 9. Error handling

Each failure maps to a clear UI state:

- **Session/token expired** (past ~1h) → "Your session expired, please sign in
  again," with a sign-in action.
- **Calendar API failure** → friendly retry message.
- **Gemini quota / blocked / empty / generic** → the distinct, readable messages
  the ported engine defines.

---

## 10. Testing

- **Engine (Vitest):** unit tests for `windowing`, `buildPrompt` /
  `totalScheduledHours`, response parsing, and `summarize()` with a **mocked**
  Gemini client (offline, no key) — mirroring Phase 1's coverage, including the
  empty-window no-call path and error mapping.
- **Calendar mapper:** tests mapping sample Google `events.list` payloads
  (timed, all-day, recurring-expanded, missing optional fields) → `Event[]`.
- **UI:** light smoke coverage only, not exhaustive component tests.

---

## 11. Deployment

- Build **local-first** (`localhost:3000`).
- Structured to deploy to **Vercel** cleanly: at deploy time, add the env vars and
  a production redirect URI (`https://<domain>/api/auth/callback/google`) in
  Google Cloud. Deployment is a small follow-up after the local app works.

---

## 12. Tech stack summary

- **Framework:** Next.js (App Router), TypeScript.
- **Auth:** Auth.js (NextAuth v5), Google provider, JWT sessions (no DB).
- **Calendar:** Google Calendar API (`events.list`, read-only scope).
- **AI:** `@google/genai` (Node), model `gemini-3.6-flash`, free tier, server-side.
- **Styling:** Tailwind CSS.
- **Testing:** Vitest.
- **Deploy target:** Vercel (local-first for this phase).

---

## 13. Out of scope for Phase 2 (YAGNI)

No database, no persistent accounts, no saved preferences, no refresh-token
storage, no scheduled or email delivery, no Google app verification / public
access, no multi-calendar selection (primary calendar only). All deferred to
Phase 3.
