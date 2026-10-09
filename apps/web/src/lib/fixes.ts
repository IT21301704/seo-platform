import "server-only";
import type { ScopedPrisma } from "@seo/db";
import { FIX_KINDS, kindForRule } from "@seo/fixes";
import type { FixKind } from "@seo/fixes";
import type { WpValue } from "@seo/integrations";
import { createFixBatch } from "@seo/worker/fixes";
import { enqueueFixJob } from "@seo/worker/queue";
import { latestCompletedCrawl } from "./queries";
import type { CurrentUser } from "./session";

export const batchLabel = (n: number): string => `B-${String(n).padStart(4, "0")}`;

/** True when Phase 3 can generate a fix preview for this rule. */
export const canAutoFix = (ruleId: string): boolean => kindForRule(ruleId) !== null;

/**
 * Starts a fix batch for a rule from the latest audit (or a sitemap check) and queues the
 * preview generation. Nothing is published until the owner approves it on screen 07.
 */
export async function startFixBatch(
  db: ScopedPrisma,
  user: CurrentUser,
  projectId: string,
  ruleId: string,
  options: { urls?: string[]; sitemapCheckId?: string } = {},
): Promise<{ id: string } | { error: string }> {
  if (!canAutoFix(ruleId)) return { error: `${ruleId} has no automatic fix yet.` };
  let crawlId: string | undefined;
  if (!options.sitemapCheckId) {
    const latest = await latestCompletedCrawl(db, projectId);
    if (!latest) return { error: "Run an audit first." };
    crawlId = latest.crawl.id;
  }
  const batch = await createFixBatch(db, {
    projectId,
    organizationId: user.organizationId,
    ruleId,
    userId: user.id,
    crawlId,
    sitemapCheckId: options.sitemapCheckId,
    urls: options.urls,
  });
  await enqueueFixJob({
    batchId: batch.id,
    organizationId: user.organizationId,
    action: "generate",
  });
  await db.auditLog.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      action: "fix.batch.create",
      entityType: "fix_batch",
      entityId: batch.id,
      after: { ruleId, urls: options.urls ?? null, sitemapCheckId: options.sitemapCheckId ?? null },
      source: "user",
    },
  });
  return { id: batch.id };
}

/** A fix value as text for tables (booleans and objects become plain words). */
export function displayValue(kind: string, value: unknown): string {
  const v = value as WpValue;
  if (v === null || v === undefined || v === "") return "";
  switch (kind as FixKind) {
    case "noindex":
      return v === true ? "noindex" : "index (noindex removed)";
    case "sitemap_exclude":
      return v === true ? "Removed from sitemap" : "Listed in sitemap";
    case "sitemap_include":
      return v === false ? "Listed in sitemap" : "Not in sitemap";
    case "redirect":
      return typeof v === "object" && !Array.isArray(v) ? `${v.status} → ${v.to}` : String(v);
    case "robots_sitemap":
      return Array.isArray(v) ? v.join("\n") : String(v);
    default:
      return typeof v === "string" ? v : JSON.stringify(v);
  }
}

/** Text fields the owner can edit in the review table. */
export const editable = (kind: string): boolean => FIX_KINDS[kind as FixKind]?.input !== "fixed";
