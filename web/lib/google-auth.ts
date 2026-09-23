// Server-side helpers for keeping the Google access token fresh via the
// refresh token. Kept separate from actions.ts so the logic is unit-testable.

const REFRESH_BUFFER_MS = 60_000; // refresh a bit early to avoid edge-of-expiry failures
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/** True when the access token is missing, expired, or within the safety buffer. */
export function shouldRefresh(
  expiresAt: number | undefined,
  now: number = Date.now(),
): boolean {
  if (!expiresAt) return true;
  return now >= expiresAt * 1000 - REFRESH_BUFFER_MS;
}

export interface RefreshResult {
  accessToken: string;
  /** Unix seconds. */
  expiresAt: number;
}

/**
 * Exchange a refresh token for a new access token at Google's token endpoint.
 * Returns null on any failure (revoked/expired refresh token, network error).
 */
export async function refreshGoogleAccessToken(
  refreshToken: string,
  opts: { fetchImpl?: typeof fetch; now?: number } = {},
): Promise<RefreshResult | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now();
  try {
    const res = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    const expiresIn = data.expires_in ?? 3600;
    return {
      accessToken: data.access_token,
      expiresAt: Math.floor(now / 1000) + expiresIn,
    };
  } catch {
    return null;
  }
}
