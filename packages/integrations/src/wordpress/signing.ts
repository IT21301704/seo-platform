// HMAC request signing between the platform and the WordPress plugin (REQUIREMENTS Part I:
// "signed webhooks (HMAC) between WordPress plugin and API; replay protection"). The PHP plugin
// implements the same base string (apps/wp-plugin/includes/class-signature.php).
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SIGNATURE_VERSION = "v1";
/** Requests older or newer than this are rejected; nonces are remembered at least this long. */
export const MAX_SKEW_SECONDS = 300;

export const HEADER = {
  key: "x-seo-key",
  timestamp: "x-seo-timestamp",
  nonce: "x-seo-nonce",
  signature: "x-seo-signature",
} as const;

export type SignedHeaders = Record<(typeof HEADER)[keyof typeof HEADER], string>;

export interface SignInput {
  keyId: string;
  method: string;
  /** REST route ("/seo-platform/v1/write") or URL path ("/v1/wordpress/events"). */
  route: string;
  /** Exact request body ("" for GET). */
  body: string;
  now: Date;
  nonce?: string;
}

export const sha256Hex = (text: string): string =>
  createHash("sha256").update(text, "utf8").digest("hex");

/** timestamp \n nonce \n METHOD \n route \n sha256(body) */
export function signatureBase(
  timestamp: string,
  nonce: string,
  method: string,
  route: string,
  body: string,
): string {
  return [timestamp, nonce, method.toUpperCase(), route, sha256Hex(body)].join("\n");
}

function hmac(secret: string, base: string): string {
  return createHmac("sha256", secret).update(base, "utf8").digest("hex");
}

export function signRequest(secret: string, input: SignInput): SignedHeaders {
  const timestamp = String(Math.floor(input.now.getTime() / 1000));
  const nonce = input.nonce ?? randomBytes(16).toString("hex");
  const base = signatureBase(timestamp, nonce, input.method, input.route, input.body);
  return {
    [HEADER.key]: input.keyId,
    [HEADER.timestamp]: timestamp,
    [HEADER.nonce]: nonce,
    [HEADER.signature]: `${SIGNATURE_VERSION}=${hmac(secret, base)}`,
  };
}

export type VerifyResult =
  | { ok: true; keyId: string; nonce: string; timestamp: number }
  | { ok: false; reason: "missing" | "expired" | "bad-signature" };

/**
 * Checks signature and timestamp. The caller must also reject a nonce it has already seen
 * within MAX_SKEW_SECONDS (replay protection needs shared state, e.g. Redis).
 */
export function verifySignedRequest(
  secret: string,
  headers: (name: string) => string | null,
  request: { method: string; route: string; body: string; now: Date },
): VerifyResult {
  const keyId = headers(HEADER.key);
  const timestamp = headers(HEADER.timestamp);
  const nonce = headers(HEADER.nonce);
  const signature = headers(HEADER.signature);
  if (!keyId || !timestamp || !nonce || !signature || !/^\d+$/.test(timestamp)) {
    return { ok: false, reason: "missing" };
  }
  const ts = Number(timestamp);
  if (Math.abs(request.now.getTime() / 1000 - ts) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: "expired" };
  }
  const expected = `${SIGNATURE_VERSION}=${hmac(
    secret,
    signatureBase(timestamp, nonce, request.method, request.route, request.body),
  )}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    return { ok: false, reason: "bad-signature" };
  return { ok: true, keyId, nonce, timestamp: ts };
}

/** What the site owner pastes into the plugin settings: app URL, key id and secret. */
export interface ConnectionKey {
  v: 1;
  app: string;
  key: string;
  secret: string;
}

const KEY_PREFIX = "seowp_";

export function newSigningSecret(): string {
  return randomBytes(32).toString("hex");
}

export function encodeConnectionKey(key: Omit<ConnectionKey, "v">): string {
  return KEY_PREFIX + Buffer.from(JSON.stringify({ v: 1, ...key })).toString("base64url");
}

export function decodeConnectionKey(text: string): ConnectionKey | null {
  if (!text.startsWith(KEY_PREFIX)) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(text.slice(KEY_PREFIX.length), "base64url").toString("utf8"),
    ) as Partial<ConnectionKey>;
    if (parsed.v !== 1 || !parsed.app || !parsed.key || !parsed.secret) return null;
    return { v: 1, app: parsed.app, key: parsed.key, secret: parsed.secret };
  } catch {
    return null;
  }
}
