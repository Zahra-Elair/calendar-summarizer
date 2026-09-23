import { describe, it, expect, vi } from "vitest";
import { shouldRefresh, refreshGoogleAccessToken } from "./google-auth";

const NOW = 1_000_000_000_000; // fixed "now" in ms
const nowSeconds = Math.floor(NOW / 1000);

describe("shouldRefresh", () => {
  it("is false when the token is valid well beyond the buffer", () => {
    expect(shouldRefresh(nowSeconds + 300, NOW)).toBe(false); // 5 min out
  });

  it("is true when the token has already expired", () => {
    expect(shouldRefresh(nowSeconds - 10, NOW)).toBe(true);
  });

  it("is true within the 60s safety buffer", () => {
    expect(shouldRefresh(nowSeconds + 30, NOW)).toBe(true); // 30s out < 60s buffer
  });

  it("is true when expiresAt is undefined", () => {
    expect(shouldRefresh(undefined, NOW)).toBe(true);
  });
});

describe("refreshGoogleAccessToken", () => {
  it("returns a fresh access token and computed expiry on success", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: "new-token", expires_in: 3600 }),
    })) as unknown as typeof fetch;

    const result = await refreshGoogleAccessToken("refresh-abc", { fetchImpl, now: NOW });

    expect(result).not.toBeNull();
    expect(result!.accessToken).toBe("new-token");
    expect(result!.expiresAt).toBe(nowSeconds + 3600);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("returns null when Google responds with an error", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => "invalid_grant",
    })) as unknown as typeof fetch;

    expect(await refreshGoogleAccessToken("bad-refresh", { fetchImpl })).toBeNull();
  });

  it("returns null when the response has no access_token", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ expires_in: 3600 }),
    })) as unknown as typeof fetch;

    expect(await refreshGoogleAccessToken("refresh-abc", { fetchImpl })).toBeNull();
  });

  it("returns null when the fetch throws (network error)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    expect(await refreshGoogleAccessToken("refresh-abc", { fetchImpl })).toBeNull();
  });
});
