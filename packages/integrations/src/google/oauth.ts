import type { JsonHttp } from "../http";
import { ok } from "../http";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Least-privilege scopes (REQUIREMENTS M9: read-only; sitemap submit arrives with auto-fix). */
export const SCOPES = {
  gsc: ["https://www.googleapis.com/auth/webmasters.readonly"],
  ga4: ["https://www.googleapis.com/auth/analytics.readonly"],
} as const;

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface StoredTokens {
  refreshToken: string;
  accessToken: string;
  /** Epoch ms. */
  expiresAt: number;
  scope: string;
}

export function authorizationUrl(
  client: OAuthClient,
  type: keyof typeof SCOPES,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    response_type: "code",
    scope: SCOPES[type].join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export async function exchangeCode(
  http: JsonHttp,
  client: OAuthClient,
  code: string,
  now: number,
): Promise<StoredTokens> {
  const body = ok(
    await http.send<TokenResponse>({
      method: "POST",
      url: GOOGLE_TOKEN_URL,
      form: {
        code,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        redirect_uri: client.redirectUri,
        grant_type: "authorization_code",
      },
    }),
    "Google token exchange",
  );
  if (!body.refresh_token)
    throw new Error(
      "Google did not return a refresh token; remove the app's access in your Google account and connect again",
    );
  return {
    refreshToken: body.refresh_token,
    accessToken: body.access_token,
    expiresAt: now + body.expires_in * 1000,
    scope: body.scope,
  };
}

/** Returns a valid access token, refreshing it (with a 60 s margin) when needed. */
export async function freshTokens(
  http: JsonHttp,
  client: Omit<OAuthClient, "redirectUri">,
  tokens: StoredTokens,
  now: number,
): Promise<StoredTokens> {
  if (tokens.expiresAt - 60_000 > now) return tokens;
  const body = ok(
    await http.send<TokenResponse>({
      method: "POST",
      url: GOOGLE_TOKEN_URL,
      form: {
        refresh_token: tokens.refreshToken,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        grant_type: "refresh_token",
      },
    }),
    "Google token refresh",
  );
  return {
    ...tokens,
    accessToken: body.access_token,
    expiresAt: now + body.expires_in * 1000,
    scope: body.scope || tokens.scope,
  };
}
