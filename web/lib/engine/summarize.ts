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
