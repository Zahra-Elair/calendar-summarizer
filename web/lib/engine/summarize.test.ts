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

  it("retries once on a transient overload (503) and then succeeds", async () => {
    const raw = JSON.stringify({ overview: "ok", keyEvents: [], timeBreakdown: "", highlights: [] });
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("The model is overloaded"), { status: 503 }))
      .mockResolvedValueOnce({ text: raw });
    const client = { models: { generateContent } };
    const s = await summarize(oneEvent, "daily", "2026-09-22", "2026-09-23", { client, retryDelayMs: 0 });
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(s.overview).toBe("ok");
  });

  it("maps a persistent overload to a friendly 'busy' SummarizerError", async () => {
    const generateContent = vi.fn(async () => {
      throw Object.assign(new Error("The model is overloaded. Please try again later."), { status: 503 });
    });
    const client = { models: { generateContent } };
    await expect(
      summarize(oneEvent, "daily", "2026-09-22", "2026-09-23", { client, retryDelayMs: 0 }),
    ).rejects.toThrow(/busy/i);
    expect(generateContent).toHaveBeenCalledTimes(2); // original + one retry
  });
});
