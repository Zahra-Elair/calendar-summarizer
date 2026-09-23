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
