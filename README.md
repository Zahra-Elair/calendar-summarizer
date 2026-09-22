# calsum — AI Calendar Summarizer (Phase 1)

Generate a daily / weekly / monthly natural-language summary of a calendar,
powered by the free tier of Google Gemini. Phase 1 runs against built-in sample
calendar data — no sign-in required.

## Setup

```bash
python -m pip install -e ".[dev]"
cp .env.example .env    # then edit .env and paste your key
```

Get a free key at https://aistudio.google.com/apikey and put it in `.env`:

```
GEMINI_API_KEY=your_free_key
```

`.env` is gitignored, so your key stays out of version control. An exported
`GEMINI_API_KEY` environment variable also works and takes precedence over `.env`.

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
