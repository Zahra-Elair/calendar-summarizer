import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    // Note: the Google access token is intentionally NOT on the session — it
    // must never reach the browser. It lives in the JWT (below) only.
    calendarGranted?: boolean;
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number; // Unix seconds
    calendarGranted?: boolean;
  }
}
