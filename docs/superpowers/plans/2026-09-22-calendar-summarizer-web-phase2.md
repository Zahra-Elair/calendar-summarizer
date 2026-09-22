# Calendar Summarizer Web App (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Next.js/TypeScript web app where a user signs in with Google, the app reads their real Google Calendar, and shows an AI-generated daily/weekly/monthly summary on demand (session-based, no database).

**Architecture:** Next.js App Router app in `web/`. Auth.js (NextAuth v5) handles Google OAuth with the `calendar.readonly` scope and stores the access token in an encrypted JWT session. A server action fetches Calendar events in the requested window, maps them to the engine's `Event` shape, and runs the Phase-1 engine (ported to TypeScript) to produce a `Summary` via Gemini. All Gemini/calendar/token work is server-side; nothing sensitive reaches the browser.

**Tech Stack:** Next.js 15 (App Router), TypeScript (strict), Auth.js v5 (`next-auth@beta`), `@google/genai` (model `gemini-3.6-flash`), Luxon (date math), Tailwind CSS, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-22-calendar-summarizer-web-phase2-design.md`

## Global Constraints

- Node 20+. TypeScript `strict: true`.
- AI: `@google/genai`, model from env `GEMINI_MODEL` (default `gemini-3.6-flash`); key from `GEMINI_API_KEY`. **Server-side only** — never referenced in a client component.
- Auth: Auth.js v5, Google provider, **JWT session strategy (no database)**; scopes `openid email profile https://www.googleapis.com/auth/calendar.readonly`.
- All calendar fetches, Gemini calls, and access-token reads happen **server-side** (server components, server actions, or route handlers).
- Date math via Luxon. Windows are `[start, end)` (end exclusive); the **weekly** window starts **Monday** (Luxon ISO week). Windows are computed in the **user's IANA timezone**, passed from the client.
- Engine behavior mirrors Phase 1: an **empty window returns an empty summary and makes zero Gemini calls**; typed errors for missing-key / quota / blocked-or-empty / generic.
- The Phase 1 Python code moves to `python-cli/` and must still pass its test suite from there.
- TDD for all pure logic (engine, mapper). Commit after each task.

---

## File Structure

```
calendar-summarizer/
├── docs/                              # unchanged, project-wide
├── python-cli/                        # Phase 1 moved here (src/, tests/, pyproject.toml, README, .env.example)
├── web/
│   ├── package.json, tsconfig.json, next.config.ts, vitest.config.ts
│   ├── postcss.config.mjs, tailwind styles in app/globals.css
│   ├── .env.local.example
│   ├── auth.ts                        # Auth.js config (handlers, auth, signIn, signOut)
│   ├── types/next-auth.d.ts           # session.accessToken augmentation
│   ├── app/
│   │   ├── layout.tsx, globals.css
│   │   ├── page.tsx                   # landing (signed out) → link to dashboard
│   │   ├── dashboard/page.tsx         # server component, auth-gated
│   │   └── api/auth/[...nextauth]/route.ts
│   ├── lib/
│   │   ├── engine/
│   │   │   ├── types.ts               # Event, Summary, Period
│   │   │   ├── windowing.ts           # windowFor()
│   │   │   ├── windowing.test.ts
│   │   │   ├── prompt.ts              # buildPrompt(), totalScheduledHours()
│   │   │   ├── prompt.test.ts
│   │   │   ├── summarize.ts           # summarize() + errors
│   │   │   └── summarize.test.ts
│   │   ├── google-calendar.ts         # fetchEvents(): windowFor → events.list → Event[]
│   │   ├── google-calendar.test.ts    # mapper tests
│   │   └── actions.ts                 # "use server" generateSummary()
│   └── components/
│       ├── SignInButton.tsx, SignOutButton.tsx
│       ├── PeriodSelector.tsx
│       ├── SummaryView.tsx
│       └── DashboardClient.tsx        # orchestrates selector + action + states
└── README.md                          # project overview
```

---

### Task 1: Restructure repo into `python-cli/` + project README

**Files:**
- Move: `src/`, `tests/`, `pyproject.toml`, `README.md`, `.env.example` → under `python-cli/`
- Create: root `README.md` (project overview)

**Interfaces:**
- Consumes: nothing. Produces: the relocated Python project (unchanged behavior).

- [ ] **Step 1: Move Phase 1 files with git**

```bash
cd "<repo root>"
mkdir python-cli
git mv src python-cli/src
git mv tests python-cli/tests
git mv pyproject.toml python-cli/pyproject.toml
git mv README.md python-cli/README.md
git mv .env.example python-cli/.env.example
```
(Leave `docs/` and the gitignored root `.env` where they are.)

- [ ] **Step 2: Verify the Python suite still passes from its new home**

Run: `cd python-cli && python -m pytest -q`
Expected: `37 passed`. (`pyproject.toml`'s `pythonpath=["src"]`/`testpaths=["tests"]` are relative, so they still resolve.)

- [ ] **Step 3: Write the root `README.md`**

```markdown
# Calendar Summarizer

AI-generated summaries of your calendar (daily / weekly / monthly), powered by
the free tier of Google Gemini.

- **`python-cli/`** — Phase 1: the summarizer engine + CLI (runs on sample data).
  See [python-cli/README.md](python-cli/README.md).
- **`web/`** — Phase 2: a Next.js web app. Sign in with Google, summarize your
  real Google Calendar. See [web/README.md](web/README.md).

Built in phases; see `docs/superpowers/specs/` for the designs.
```

- [ ] **Step 4: Update `.gitignore` for the web app** (append)

```
# Next.js / web
web/node_modules/
web/.next/
web/.env.local
web/coverage/
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: move Phase 1 into python-cli/, add project README"
```

---

### Task 2: Scaffold the Next.js app in `web/`

**Files:**
- Create: the `web/` Next.js project (App Router, TS, Tailwind), `web/vitest.config.ts`, `web/.env.local.example`, a trivial passing test.

**Interfaces:**
- Produces: a runnable Next.js app and a working Vitest setup that later tasks add to.

- [ ] **Step 1: Scaffold with create-next-app**

Run from the repo root:
```bash
npx create-next-app@latest web --typescript --app --tailwind --eslint --no-src-dir --import-alias "@/*" --use-npm
```
Accept defaults for any remaining prompts. If a flag is rejected by the installed
create-next-app version, drop that flag and pick the equivalent option at the
interactive prompt (App Router: yes, `src/` dir: no, import alias: `@/*`).

- [ ] **Step 2: Add runtime + test dependencies**

```bash
cd web
npm install next-auth@beta @google/genai luxon
npm install -D vitest @vitejs/plugin-react jsdom @types/luxon
```

- [ ] **Step 3: Create `web/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: { environment: "node", globals: true, include: ["lib/**/*.test.ts"] },
  resolve: { alias: { "@": new URL(".", import.meta.url).pathname } },
});
```

- [ ] **Step 4: Add test script to `web/package.json`**

Add to `"scripts"`: `"test": "vitest run"`.

- [ ] **Step 5: Create `web/.env.local.example`**

```
# Google OAuth client (from Google Cloud Console → APIs & Services → Credentials)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Auth.js cookie-encryption secret: generate with `npx auth secret`
AUTH_SECRET=

# Free Gemini key from https://aistudio.google.com/apikey
GEMINI_API_KEY=

# Optional model override (default gemini-3.6-flash)
# GEMINI_MODEL=gemini-3.6-flash
```

- [ ] **Step 6: Add a trivial test to prove Vitest works** — `web/lib/smoke.test.ts`

```ts
import { describe, it, expect } from "vitest";
describe("smoke", () => {
  it("runs", () => { expect(1 + 1).toBe(2); });
});
```

- [ ] **Step 7: Verify build + test**

Run: `cd web && npm run build && npm test`
Expected: build succeeds; 1 test passes.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat(web): scaffold Next.js app with Tailwind and Vitest"
```

---

### Task 3: Engine — types + windowing (Luxon)

**Files:**
- Create: `web/lib/engine/types.ts`, `web/lib/engine/windowing.ts`, `web/lib/engine/windowing.test.ts`
- Delete: `web/lib/smoke.test.ts` (superseded)

**Interfaces:**
- Produces:
  - `type Period = "daily" | "weekly" | "monthly"`
  - `interface CalEvent { title: string; start: Date; end: Date; allDay: boolean; location?: string; attendees: string[]; description?: string }`
  - `interface Summary { period: Period; start: string; end: string; overview: string; keyEvents: string[]; timeBreakdown: string; highlights: string[]; empty: boolean }`
  - `windowFor(period: Period, referenceISODate: string, zone: string): { start: DateTime; end: DateTime }` (Luxon `DateTime`), window `[start, end)`, weekly starts Monday.

- [ ] **Step 1: Write the failing test** — `web/lib/engine/windowing.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { windowFor } from "./windowing";

const ZONE = "UTC";

describe("windowFor", () => {
  it("daily is one day", () => {
    const { start, end } = windowFor("daily", "2026-09-22", ZONE);
    expect(start.toISODate()).toBe("2026-09-22");
    expect(end.toISODate()).toBe("2026-09-23");
  });
  it("weekly starts Monday", () => {
    // 2026-09-22 is a Tuesday → week is Mon 21 .. next Mon 28
    const { start, end } = windowFor("weekly", "2026-09-22", ZONE);
    expect(start.toISODate()).toBe("2026-09-21");
    expect(end.toISODate()).toBe("2026-09-28");
  });
  it("monthly is the calendar month", () => {
    const { start, end } = windowFor("monthly", "2026-09-22", ZONE);
    expect(start.toISODate()).toBe("2026-09-01");
    expect(end.toISODate()).toBe("2026-10-01");
  });
  it("throws on unknown period", () => {
    // @ts-expect-error invalid period
    expect(() => windowFor("yearly", "2026-09-22", ZONE)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run lib/engine/windowing.test.ts`
Expected: FAIL — cannot find module `./windowing`.

- [ ] **Step 3: Write `web/lib/engine/types.ts`**

```ts
export type Period = "daily" | "weekly" | "monthly";

export interface CalEvent {
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location?: string;
  attendees: string[];
  description?: string;
}

export interface Summary {
  period: Period;
  start: string; // ISO date (inclusive)
  end: string;   // ISO date (exclusive)
  overview: string;
  keyEvents: string[];
  timeBreakdown: string;
  highlights: string[];
  empty: boolean;
}
```

- [ ] **Step 4: Write `web/lib/engine/windowing.ts`**

```ts
import { DateTime } from "luxon";
import type { Period } from "./types";

export function windowFor(
  period: Period,
  referenceISODate: string,
  zone: string,
): { start: DateTime; end: DateTime } {
  const ref = DateTime.fromISO(referenceISODate, { zone });
  if (!ref.isValid) throw new Error(`Invalid reference date: ${referenceISODate}`);

  switch (period) {
    case "daily":
      return { start: ref.startOf("day"), end: ref.startOf("day").plus({ days: 1 }) };
    case "weekly":
      // Luxon's startOf("week") is Monday (ISO).
      return { start: ref.startOf("week"), end: ref.startOf("week").plus({ weeks: 1 }) };
    case "monthly":
      return { start: ref.startOf("month"), end: ref.startOf("month").plus({ months: 1 }) };
    default:
      throw new Error(`Unknown period: ${period as string}`);
  }
}
```

- [ ] **Step 5: Run test to verify it passes; remove the smoke test**

Run: `rm lib/smoke.test.ts && npx vitest run lib/engine/windowing.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(web): engine types and Luxon windowing"
```

---

### Task 4: Engine — prompt building + Gemini summarize

**Files:**
- Create: `web/lib/engine/errors.ts`, `web/lib/engine/prompt.ts`, `web/lib/engine/prompt.test.ts`, `web/lib/engine/summarize.ts`, `web/lib/engine/summarize.test.ts`

**Interfaces:**
- Consumes: `CalEvent`, `Summary`, `Period` (Task 3).
- Produces:
  - `errors.ts`: error classes `SummarizerError`, `MissingApiKeyError`, `QuotaExceededError` (single home — avoids a `prompt ↔ summarize` import cycle)
  - `totalScheduledHours(events: CalEvent[]): number` (1-decimal; all-day → 0)
  - `buildPrompt(events: CalEvent[], period: Period, startISO: string, endISO: string): string`
  - `parseResponse(raw: string, period: Period, startISO: string, endISO: string): Summary`
  - `summarize(events, period, startISO, endISO, opts?: { client?: GenAILike; model?: string }): Promise<Summary>`
  - `summarize.ts` also re-exports the three error classes (so `import { SummarizerError, ... } from "./summarize"` keeps working)
  - `interface GenAILike { models: { generateContent(args: { model: string; contents: string; config?: unknown }): Promise<{ text?: string | null }> } }`

- [ ] **Step 1: Write the failing tests** — `web/lib/engine/prompt.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { totalScheduledHours, buildPrompt, parseResponse } from "./prompt";
import type { CalEvent } from "./types";

const ev = (title: string, start: string, end: string, allDay = false): CalEvent => ({
  title, start: new Date(start), end: new Date(end), allDay, attendees: [],
});

describe("totalScheduledHours", () => {
  it("sums durations to one decimal", () => {
    const events = [
      ev("a", "2026-09-22T09:00:00Z", "2026-09-22T10:00:00Z"),
      ev("b", "2026-09-22T11:00:00Z", "2026-09-22T11:30:00Z"),
    ];
    expect(totalScheduledHours(events)).toBe(1.5);
  });
  it("excludes all-day events", () => {
    const events = [ev("holiday", "2026-09-22T00:00:00Z", "2026-09-23T00:00:00Z", true)];
    expect(totalScheduledHours(events)).toBe(0);
  });
});

describe("buildPrompt", () => {
  it("mentions the period, dates, event title and the grounded hours", () => {
    const events = [ev("Standup", "2026-09-22T09:00:00Z", "2026-09-22T09:15:00Z")];
    const p = buildPrompt(events, "daily", "2026-09-22", "2026-09-23");
    expect(p).toContain("daily");
    expect(p).toContain("2026-09-22");
    expect(p).toContain("Standup");
    expect(p).toContain("0.2"); // 15 min rounded
  });
});

describe("parseResponse", () => {
  it("parses a JSON object into a Summary", () => {
    const raw = JSON.stringify({
      overview: "A light day.", keyEvents: ["09:00 Standup"],
      timeBreakdown: "~0.2h", highlights: ["Nothing urgent"],
    });
    const s = parseResponse(raw, "daily", "2026-09-22", "2026-09-23");
    expect(s.overview).toBe("A light day.");
    expect(s.keyEvents).toEqual(["09:00 Standup"]);
    expect(s.empty).toBe(false);
  });
  it("tolerates a ```json fenced block", () => {
    const raw = "```json\n{\"overview\":\"x\",\"keyEvents\":[],\"timeBreakdown\":\"\",\"highlights\":[]}\n```";
    expect(parseResponse(raw, "weekly", "2026-09-21", "2026-09-28").overview).toBe("x");
  });
  it("throws on non-object JSON", () => {
    expect(() => parseResponse("[1,2,3]", "daily", "2026-09-22", "2026-09-23")).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run lib/engine/prompt.test.ts`
Expected: FAIL — cannot find module `./prompt`.

- [ ] **Step 3: Write `web/lib/engine/errors.ts`, then `web/lib/engine/prompt.ts`**

`web/lib/engine/errors.ts`:
```ts
export class SummarizerError extends Error {}
export class MissingApiKeyError extends SummarizerError {}
export class QuotaExceededError extends SummarizerError {}
```

`web/lib/engine/prompt.ts`:
```ts
import type { CalEvent, Period, Summary } from "./types";
import { SummarizerError } from "./errors";

export function totalScheduledHours(events: CalEvent[]): number {
  const ms = events.reduce(
    (acc, e) => acc + (e.allDay ? 0 : e.end.getTime() - e.start.getTime()),
    0,
  );
  return Math.round((ms / 3_600_000) * 10) / 10;
}

function formatEvent(e: CalEvent): string {
  const when = `${e.start.toISOString()}–${e.end.toISOString()}`;
  const parts = [when, e.title];
  if (e.location) parts.push(`@ ${e.location}`);
  if (e.attendees.length) parts.push(`with ${e.attendees.join(", ")}`);
  return parts.join(" | ");
}

export function buildPrompt(
  events: CalEvent[], period: Period, startISO: string, endISO: string,
): string {
  const eventsBlock = events.length ? events.map(formatEvent).join("\n") : "(no events)";
  const hours = totalScheduledHours(events);
  return [
    "You are a helpful assistant that summarizes a person's calendar.",
    `Write a ${period} summary for the period ${startISO} (inclusive) to ${endISO} (exclusive).`,
    "",
    `Total scheduled hours (computed for you, use it — do not invent numbers): ${hours}`,
    `Number of events: ${events.length}`,
    "",
    `Events:\n${eventsBlock}`,
    "",
    "For a daily summary be concrete and time-ordered. For weekly or monthly, zoom out to themes, busiest days, and overall load rather than listing every event.",
    "",
    'Respond ONLY with a JSON object with exactly these keys: "overview" (string, 1-2 sentences), "keyEvents" (array of short strings), "timeBreakdown" (string), "highlights" (array of short strings).',
  ].join("\n");
}

function stripCodeFence(raw: string): string {
  let t = raw.trim();
  if (t.startsWith("```")) {
    t = t.includes("\n") ? t.slice(t.indexOf("\n") + 1) : t;
    const fence = t.lastIndexOf("```");
    if (fence !== -1) t = t.slice(0, fence);
  }
  return t.trim();
}

export function parseResponse(
  raw: string, period: Period, startISO: string, endISO: string,
): Summary {
  const data: unknown = JSON.parse(stripCodeFence(raw));
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new SummarizerError("Unexpected response shape from model (expected a JSON object).");
  }
  const d = data as Record<string, unknown>;
  return {
    period, start: startISO, end: endISO,
    overview: typeof d.overview === "string" ? d.overview : "",
    keyEvents: Array.isArray(d.keyEvents) ? d.keyEvents.map(String) : [],
    timeBreakdown: typeof d.timeBreakdown === "string" ? d.timeBreakdown : "",
    highlights: Array.isArray(d.highlights) ? d.highlights.map(String) : [],
    empty: false,
  };
}
```

- [ ] **Step 4: Write the failing summarize test** — `web/lib/engine/summarize.test.ts`

```ts
import { describe, it, expect, vi } from "vitest";
import { summarize, SummarizerError, MissingApiKeyError, QuotaExceededError } from "./summarize";
import type { CalEvent } from "./types";

const oneEvent: CalEvent[] = [{
  title: "Standup", start: new Date("2026-09-22T09:00:00Z"),
  end: new Date("2026-09-22T09:15:00Z"), allDay: false, attendees: [],
}];

const fakeClient = (impl: () => Promise<{ text?: string | null }>) => ({
  models: { generateContent: vi.fn(impl) },
});

describe("summarize", () => {
  it("empty events → empty summary, no API call", async () => {
    const client = fakeClient(async () => ({ text: "SHOULD NOT BE USED" }));
    const s = await summarize([], "daily", "2026-09-22", "2026-09-23", { client });
    expect(s.empty).toBe(true);
    expect(client.models.generateContent).not.toHaveBeenCalled();
    expect(s.overview.toLowerCase()).toContain("nothing");
  });

  it("calls client and parses result", async () => {
    const raw = JSON.stringify({ overview: "Busy morning.", keyEvents: ["09:00 Standup"], timeBreakdown: "0.2h", highlights: [] });
    const client = fakeClient(async () => ({ text: raw }));
    const s = await summarize(oneEvent, "daily", "2026-09-22", "2026-09-23", { client });
    expect(client.models.generateContent).toHaveBeenCalledOnce();
    expect(s.overview).toBe("Busy morning.");
  });

  it("empty/None response text → SummarizerError", async () => {
    const client = fakeClient(async () => ({ text: null }));
    await expect(summarize(oneEvent, "daily", "2026-09-22", "2026-09-23", { client })).rejects.toBeInstanceOf(SummarizerError);
  });

  it("a 429-coded error → QuotaExceededError", async () => {
    const client = fakeClient(async () => { const e: any = new Error("quota"); e.status = 429; throw e; });
    await expect(summarize(oneEvent, "daily", "2026-09-22", "2026-09-23", { client })).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it("any other client error → SummarizerError", async () => {
    const client = fakeClient(async () => { throw new Error("boom"); });
    await expect(summarize(oneEvent, "daily", "2026-09-22", "2026-09-23", { client })).rejects.toBeInstanceOf(SummarizerError);
  });

  it("missing key and no injected client → MissingApiKeyError", async () => {
    const prev = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      await expect(summarize(oneEvent, "daily", "2026-09-22", "2026-09-23")).rejects.toBeInstanceOf(MissingApiKeyError);
    } finally {
      if (prev !== undefined) process.env.GEMINI_API_KEY = prev;
    }
  });
});
```

- [ ] **Step 5: Write `web/lib/engine/summarize.ts`**

```ts
import { GoogleGenAI } from "@google/genai";
import type { CalEvent, Period, Summary } from "./types";
import { buildPrompt, parseResponse } from "./prompt";
import { SummarizerError, MissingApiKeyError, QuotaExceededError } from "./errors";

export { SummarizerError, MissingApiKeyError, QuotaExceededError } from "./errors";

export interface GenAILike {
  models: {
    generateContent(args: { model: string; contents: string; config?: unknown }): Promise<{ text?: string | null }>;
  };
}

const DEFAULT_MODEL = "gemini-3.6-flash";

function emptySummary(period: Period, startISO: string, endISO: string): Summary {
  return {
    period, start: startISO, end: endISO,
    overview: "Nothing scheduled for this period.",
    keyEvents: [], timeBreakdown: "0h scheduled", highlights: [], empty: true,
  };
}

function makeClient(): GenAILike {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new MissingApiKeyError(
      "GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey.",
    );
  }
  return new GoogleGenAI({ apiKey }) as unknown as GenAILike;
}

export async function summarize(
  events: CalEvent[], period: Period, startISO: string, endISO: string,
  opts: { client?: GenAILike; model?: string } = {},
): Promise<Summary> {
  if (events.length === 0) return emptySummary(period, startISO, endISO);

  const client = opts.client ?? makeClient();
  const model = opts.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const prompt = buildPrompt(events, period, startISO, endISO);

  let text: string | null | undefined;
  try {
    const res = await client.models.generateContent({
      model, contents: prompt, config: { responseMimeType: "application/json" },
    });
    text = res.text;
  } catch (err: unknown) {
    const status = (err as { status?: number; code?: number })?.status
      ?? (err as { code?: number })?.code;
    if (status === 429) throw new QuotaExceededError("Gemini free-tier quota/rate limit reached. Try again shortly.");
    throw new SummarizerError(`Failed to reach Gemini: ${(err as Error).message}`);
  }

  if (!text) throw new SummarizerError("Gemini returned an empty or blocked response.");
  return parseResponse(text, period, startISO, endISO);
}
```

- [ ] **Step 6: Run both engine test files to verify they pass**

Run: `cd web && npx vitest run lib/engine`
Expected: PASS (prompt: 6, summarize: 6).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(web): port prompt building and Gemini summarize with typed errors"
```

---

### Task 5: Auth.js Google sign-in

**Files:**
- Create: `web/auth.ts`, `web/app/api/auth/[...nextauth]/route.ts`, `web/types/next-auth.d.ts`, `web/components/SignInButton.tsx`, `web/components/SignOutButton.tsx`, `web/app/page.tsx` (landing)

**Interfaces:**
- Produces: `auth`, `signIn`, `signOut`, `handlers` from `web/auth.ts`; a session whose `accessToken` holds the Google token (server-side).

- [ ] **Step 1: Write `web/auth.ts`**

```ts
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: [
    Google({
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/calendar.readonly",
          access_type: "online",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token) token.accessToken = account.access_token;
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      return session;
    },
  },
});
```

- [ ] **Step 2: Write `web/types/next-auth.d.ts`** (module augmentation)

```ts
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
  }
}
```

- [ ] **Step 3: Write `web/app/api/auth/[...nextauth]/route.ts`**

```ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 4: Write the sign-in/out components**

`web/components/SignInButton.tsx`:
```tsx
import { signIn } from "@/auth";

export function SignInButton() {
  return (
    <form action={async () => { "use server"; await signIn("google", { redirectTo: "/dashboard" }); }}>
      <button type="submit" className="rounded-lg bg-black px-5 py-2.5 text-white hover:bg-gray-800">
        Sign in with Google
      </button>
    </form>
  );
}
```

`web/components/SignOutButton.tsx`:
```tsx
import { signOut } from "@/auth";

export function SignOutButton() {
  return (
    <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
      <button type="submit" className="text-sm text-gray-600 hover:text-black">Sign out</button>
    </form>
  );
}
```

- [ ] **Step 5: Write the landing page** — `web/app/page.tsx`

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignInButton } from "@/components/SignInButton";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/dashboard");
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold">Calendar Summarizer</h1>
      <p className="max-w-md text-gray-600">
        AI summaries of your Google Calendar — daily, weekly, or monthly.
      </p>
      <SignInButton />
    </main>
  );
}
```

- [ ] **Step 6: Verify it builds and typechecks**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds. (Auth needs env vars only at request time, not build time.)

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(web): Auth.js Google sign-in with calendar scope"
```

---

### Task 6: Google Calendar fetch + event mapper

**Files:**
- Create: `web/lib/google-calendar.ts`, `web/lib/google-calendar.test.ts`

**Interfaces:**
- Consumes: `windowFor` (Task 3), `CalEvent` (Task 3).
- Produces:
  - `mapGoogleEvent(raw: GoogleEvent): CalEvent` (exported for testing)
  - `fetchCalendarEvents(accessToken: string, period: Period, referenceISODate: string, zone: string): Promise<{ events: CalEvent[]; startISO: string; endISO: string }>`
  - `type GoogleEvent` matching the Calendar API `events.list` item subset used.

- [ ] **Step 1: Write the failing mapper test** — `web/lib/google-calendar.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { mapGoogleEvent } from "./google-calendar";

describe("mapGoogleEvent", () => {
  it("maps a timed event", () => {
    const e = mapGoogleEvent({
      summary: "Design review",
      start: { dateTime: "2026-09-22T14:00:00Z" },
      end: { dateTime: "2026-09-22T15:00:00Z" },
      location: "Room 4B",
      attendees: [{ email: "a@x.com" }, { displayName: "Bob" }],
      description: "d",
    });
    expect(e.title).toBe("Design review");
    expect(e.allDay).toBe(false);
    expect(e.location).toBe("Room 4B");
    expect(e.attendees).toEqual(["a@x.com", "Bob"]);
    expect(e.start.toISOString()).toBe("2026-09-22T14:00:00.000Z");
  });

  it("maps an all-day event", () => {
    const e = mapGoogleEvent({
      summary: "Holiday",
      start: { date: "2026-09-22" },
      end: { date: "2026-09-23" },
    });
    expect(e.allDay).toBe(true);
    expect(e.attendees).toEqual([]);
  });

  it("defaults a missing title", () => {
    const e = mapGoogleEvent({ start: { dateTime: "2026-09-22T09:00:00Z" }, end: { dateTime: "2026-09-22T09:15:00Z" } });
    expect(e.title).toBe("(no title)");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run lib/google-calendar.test.ts`
Expected: FAIL — cannot find module `./google-calendar`.

- [ ] **Step 3: Write `web/lib/google-calendar.ts`**

```ts
import { windowFor } from "./engine/windowing";
import type { CalEvent, Period } from "./engine/types";

export interface GoogleEvent {
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email?: string; displayName?: string }[];
}

export function mapGoogleEvent(raw: GoogleEvent): CalEvent {
  const allDay = Boolean(raw.start?.date && !raw.start?.dateTime);
  const startStr = raw.start?.dateTime ?? raw.start?.date ?? "";
  const endStr = raw.end?.dateTime ?? raw.end?.date ?? startStr;
  return {
    title: raw.summary?.trim() || "(no title)",
    start: new Date(startStr),
    end: new Date(endStr),
    allDay,
    location: raw.location,
    attendees: (raw.attendees ?? []).map((a) => a.email ?? a.displayName ?? "").filter(Boolean),
    description: raw.description,
  };
}

export async function fetchCalendarEvents(
  accessToken: string, period: Period, referenceISODate: string, zone: string,
): Promise<{ events: CalEvent[]; startISO: string; endISO: string }> {
  const { start, end } = windowFor(period, referenceISODate, zone);
  const params = new URLSearchParams({
    timeMin: start.toISO()!,
    timeMax: end.toISO()!,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" },
  );
  if (res.status === 401) {
    const e = new Error("Calendar authorization expired.");
    (e as { code?: string }).code = "AUTH_EXPIRED";
    throw e;
  }
  if (!res.ok) throw new Error(`Calendar API error: ${res.status}`);
  const data = (await res.json()) as { items?: GoogleEvent[] };
  const events = (data.items ?? []).map(mapGoogleEvent);
  return { events, startISO: start.toISODate()!, endISO: end.toISODate()! };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd web && npx vitest run lib/google-calendar.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): Google Calendar fetch and event mapper"
```

---

### Task 7: Server action + dashboard UI

**Files:**
- Create: `web/lib/actions.ts`, `web/app/dashboard/page.tsx`, `web/components/DashboardClient.tsx`, `web/components/PeriodSelector.tsx`, `web/components/SummaryView.tsx`

**Interfaces:**
- Consumes: `auth` (Task 5), `fetchCalendarEvents` (Task 6), `summarize` + errors (Task 4), `Summary`/`Period` (Task 3).
- Produces:
  - server action `generateSummary(input: { period: Period; date: string; zone: string }): Promise<{ ok: true; summary: Summary } | { ok: false; error: string; needsSignIn?: boolean }>`

- [ ] **Step 1: Write the server action** — `web/lib/actions.ts`

```ts
"use server";

import { auth } from "@/auth";
import { fetchCalendarEvents } from "./google-calendar";
import { summarize, QuotaExceededError, MissingApiKeyError, SummarizerError } from "./engine/summarize";
import type { Period, Summary } from "./engine/types";

export type SummaryResult =
  | { ok: true; summary: Summary }
  | { ok: false; error: string; needsSignIn?: boolean };

export async function generateSummary(
  input: { period: Period; date: string; zone: string },
): Promise<SummaryResult> {
  const session = await auth();
  if (!session?.accessToken) {
    return { ok: false, error: "Your session expired. Please sign in again.", needsSignIn: true };
  }
  try {
    const { events, startISO, endISO } = await fetchCalendarEvents(
      session.accessToken, input.period, input.date, input.zone,
    );
    const summary = await summarize(events, input.period, startISO, endISO);
    return { ok: true, summary };
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "AUTH_EXPIRED") {
      return { ok: false, error: "Your Google session expired. Please sign in again.", needsSignIn: true };
    }
    if (err instanceof QuotaExceededError) return { ok: false, error: "Gemini free-tier limit reached. Try again shortly." };
    if (err instanceof MissingApiKeyError) return { ok: false, error: "Server is missing its Gemini API key." };
    if (err instanceof SummarizerError) return { ok: false, error: err.message };
    return { ok: false, error: "Something went wrong fetching your calendar. Please try again." };
  }
}
```

- [ ] **Step 2: Write `web/components/PeriodSelector.tsx`**

```tsx
"use client";
import type { Period } from "@/lib/engine/types";

const PERIODS: Period[] = ["daily", "weekly", "monthly"];

export function PeriodSelector({ value, onChange, disabled }: {
  value: Period; onChange: (p: Period) => void; disabled?: boolean;
}) {
  return (
    <div className="inline-flex rounded-lg border bg-white p-1">
      {PERIODS.map((p) => (
        <button key={p} type="button" disabled={disabled} onClick={() => onChange(p)}
          className={`rounded-md px-4 py-1.5 text-sm capitalize transition ${
            value === p ? "bg-black text-white" : "text-gray-600 hover:bg-gray-100"
          }`}>
          {p}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Write `web/components/SummaryView.tsx`**

```tsx
import type { Summary } from "@/lib/engine/types";

export function SummaryView({ summary }: { summary: Summary }) {
  return (
    <div className="space-y-4">
      <p className="text-lg">{summary.overview}</p>
      <Section title="Key events" items={summary.keyEvents} />
      <p className="text-sm text-gray-600">Time: {summary.timeBreakdown}</p>
      <Section title="Highlights" items={summary.highlights} />
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      {items.length ? (
        <ul className="list-disc pl-5 text-gray-800">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
      ) : (
        <p className="text-gray-400">(none)</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write `web/components/DashboardClient.tsx`**

```tsx
"use client";
import { useState } from "react";
import type { Period, Summary } from "@/lib/engine/types";
import { generateSummary } from "@/lib/actions";
import { PeriodSelector } from "./PeriodSelector";
import { SummaryView } from "./SummaryView";

export function DashboardClient() {
  const today = new Date().toISOString().slice(0, 10);
  const [period, setPeriod] = useState<Period>("weekly");
  const [date, setDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true); setError(null); setSummary(null);
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const res = await generateSummary({ period, date, zone });
    setLoading(false);
    if (res.ok) setSummary(res.summary);
    else setError(res.error);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <PeriodSelector value={period} onChange={setPeriod} disabled={loading} />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={loading}
          className="rounded-lg border px-3 py-1.5 text-sm" />
        <button onClick={run} disabled={loading}
          className="rounded-lg bg-black px-5 py-2 text-white hover:bg-gray-800 disabled:opacity-50">
          {loading ? "Summarizing…" : "Summarize"}
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-4 text-red-700">{error}</p>}
      {summary && (summary.empty
        ? <p className="rounded-lg bg-gray-50 p-4 text-gray-600">Nothing scheduled for this period.</p>
        : <div className="rounded-xl border bg-white p-6 shadow-sm"><SummaryView summary={summary} /></div>)}
    </div>
  );
}
```

- [ ] **Step 5: Write `web/app/dashboard/page.tsx`** (auth-gated server component)

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { DashboardClient } from "@/components/DashboardClient";

export default async function Dashboard() {
  const session = await auth();
  if (!session) redirect("/");
  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your calendar summary</h1>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span>{session.user?.name}</span>
          <SignOutButton />
        </div>
      </header>
      <DashboardClient />
    </main>
  );
}
```

- [ ] **Step 6: Verify typecheck + build**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(web): server action and dashboard UI with loading/empty/error states"
```

---

### Task 8: Web README + manual end-to-end verification

**Files:**
- Create: `web/README.md`

**Interfaces:** Consumes the finished app. Produces docs.

- [ ] **Step 1: Write `web/README.md`**

````markdown
# Calendar Summarizer — Web (Phase 2)

Sign in with Google and get an AI summary of your real Google Calendar
(daily / weekly / monthly), powered by the free tier of Google Gemini.

## Setup

1. Install deps: `cd web && npm install`
2. **Google OAuth client** — in [Google Cloud Console](https://console.cloud.google.com/):
   - Create a project → **APIs & Services** → enable the **Google Calendar API**.
   - **OAuth consent screen**: External, add yourself under **Test users**.
   - **Credentials → Create OAuth client ID → Web application**. Add redirect URI
     `http://localhost:3000/api/auth/callback/google`.
   - Copy the Client ID and Client Secret.
3. `cp .env.local.example .env.local` and fill in:
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `AUTH_SECRET` — run `npx auth secret`
   - `GEMINI_API_KEY` — from https://aistudio.google.com/apikey
4. `npm run dev` → open http://localhost:3000

> Note: while the OAuth app is unverified, only accounts added as **Test users**
> can sign in, and they will see an "unverified app" warning.

## Tests

```bash
npm test
```
Engine and mapper tests mock Gemini and the network — no key needed.
````

- [ ] **Step 2: Run the full web test suite**

Run: `cd web && npm test`
Expected: all engine + mapper tests pass.

- [ ] **Step 3: Manual end-to-end check** (requires OAuth client + key; done by the user)

Start `npm run dev`, sign in with a test-user Google account, pick a period, click Summarize, and confirm a real summary renders. Try empty and error paths.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "docs(web): setup and usage README"
```

---

## Notes for the implementer

- Never import `@/lib/engine/summarize`, `@/lib/google-calendar`, or `@/auth`'s server token from a client component. Client components call the **server action** (`generateSummary`) only.
- The engine and mapper tests are offline (Gemini and `fetch` are mocked/injected). Only Task 8's manual check makes real calls and needs the OAuth client + key.
- If `create-next-app` produces a slightly different default layout (e.g. a `src/` dir), adjust import paths but keep the `web/lib/...` structure this plan references.
- Do not commit `web/.env.local` (gitignored in Task 1).
```
