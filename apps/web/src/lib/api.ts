import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { forOrganization } from "@seo/db";
import type { ScopedPrisma } from "@seo/db";
import { auth } from "@/auth";
import { prisma, redis } from "./db";

export const API_SCOPES = ["sitemap:read", "sitemap:write"] as const;
export type ApiScope = (typeof API_SCOPES)[number];
export const RATE_LIMIT_PER_MINUTE = 60;

export interface ApiPrincipal {
  organizationId: string;
  db: ScopedPrisma;
  /** Set for API keys (a key only sees its own project); null for signed-in users. */
  projectId: string | null;
  scopes: ReadonlySet<ApiScope>;
  /** Rate-limit bucket. */
  subject: string;
}

export const hashKey = (key: string): string => createHash("sha256").update(key).digest("hex");

/** A new key: shown once, only its hash is stored. */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `seo_live_${randomBytes(24).toString("base64url")}`;
  return { key, prefix: key.slice(0, 16), hash: hashKey(key) };
}

export function apiError(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return Response.json({ error: { code, message } }, { status, headers });
}

/**
 * Authenticates an API request: "Authorization: Bearer seo_live_…" (API key), or the browser
 * session of a signed-in user (the OAuth option). Applies a per-key rate limit.
 */
export async function authenticate(
  request: Request,
  scope: ApiScope,
): Promise<ApiPrincipal | Response> {
  const header = request.headers.get("authorization") ?? "";
  let principal: ApiPrincipal;
  if (header.startsWith("Bearer ")) {
    const key = await prisma.apiKey.findUnique({
      where: { hashedKey: hashKey(header.slice(7).trim()) },
    });
    if (!key || key.revokedAt)
      return apiError(401, "invalid_api_key", "The API key is missing, wrong or revoked.");
    await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
    principal = {
      organizationId: key.organizationId,
      db: forOrganization(prisma, key.organizationId),
      projectId: key.projectId,
      scopes: new Set(
        key.scopes.filter((s): s is ApiScope => (API_SCOPES as readonly string[]).includes(s)),
      ),
      subject: `key:${key.id}`,
    };
  } else {
    const session = await auth();
    const user = session?.user?.id
      ? await prisma.user.findUnique({ where: { id: session.user.id } })
      : null;
    if (!user)
      return apiError(401, "unauthorized", "Send an API key as 'Authorization: Bearer <key>'.");
    const scopes: ApiScope[] = user.role === "viewer" ? ["sitemap:read"] : [...API_SCOPES];
    principal = {
      organizationId: user.organizationId,
      db: forOrganization(prisma, user.organizationId),
      projectId: null,
      scopes: new Set(scopes),
      subject: `user:${user.id}`,
    };
  }
  if (!principal.scopes.has(scope))
    return apiError(403, "insufficient_scope", `This request needs the '${scope}' scope.`);

  const window = Math.floor(Date.now() / 60_000);
  const bucket = `ratelimit:${principal.subject}:${window}`;
  const count = await redis.incr(bucket);
  if (count === 1) await redis.expire(bucket, 70);
  if (count > RATE_LIMIT_PER_MINUTE) {
    return apiError(
      429,
      "rate_limited",
      `More than ${RATE_LIMIT_PER_MINUTE} requests per minute.`,
      { "retry-after": String(60 - (Math.floor(Date.now() / 1000) % 60)) },
    );
  }
  return principal;
}

/** Loads a check the principal may see (same organization, and same project for API keys). */
export async function findCheck(principal: ApiPrincipal, checkId: string) {
  const check = await principal.db.sitemapCheck.findUnique({ where: { id: checkId } });
  if (!check || (principal.projectId && check.projectId !== principal.projectId)) return null;
  return check;
}

export function paging(url: URL, max = 500): { page: number; pageSize: number; skip: number } {
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(max, Math.max(1, Number(url.searchParams.get("pageSize")) || 100));
  return { page, pageSize, skip: (page - 1) * pageSize };
}
