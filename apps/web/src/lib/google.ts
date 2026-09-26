import "server-only";
import { GuardedJsonHttp } from "@seo/integrations";
import type { OAuthClient } from "@seo/integrations";

export type GoogleType = "gsc" | "ga4";
export const isGoogleType = (t: string): t is GoogleType => t === "gsc" || t === "ga4";

export const GOOGLE_LABEL: Record<GoogleType, string> = {
  gsc: "Google Search Console",
  ga4: "Google Analytics 4",
};

export function appUrl(): string {
  return (process.env["APP_URL"] ?? "http://localhost:3000").replace(/\/$/, "");
}

/** OAuth client, or null when GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set. */
export function oauthClient(): OAuthClient | null {
  const clientId = process.env["GOOGLE_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: `${appUrl()}/api/integrations/google/callback` };
}

/** Demo connections (sample data) are only offered in local development with fixtures. */
export const demoGoogleAllowed = (): boolean =>
  process.env["FIXTURE_SITES"] === "true" && process.env.NODE_ENV !== "production";

let http: GuardedJsonHttp | null = null;
export function googleHttp(): GuardedJsonHttp {
  http ??= new GuardedJsonHttp();
  return http;
}

export const OAUTH_COOKIE = "seo_google_oauth";
