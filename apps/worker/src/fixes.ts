// Auto-fix engine (REQUIREMENTS M12, M14): generate → rule re-check → preview → approve →
// publish (old value saved first) → verify (5 min, 30 min, 24 h retries) → automatic rollback on
// failure; manual rollback per item or batch. CLAUDE.md rule 5: nothing reaches a website
// without preview and approval, and every change is logged and reversible.
import { buildSiteFacts, extractPageFacts, HttpFetcher } from "@seo/crawler";
import type { CrawlSnapshot, Fetcher, OwnerIntent } from "@seo/crawler";
import { Prisma } from "@seo/db";
import type { FixBatchState, FixState, ScopedPrisma } from "@seo/db";
import {
  FIX_KINDS,
  buildCandidates,
  kindForRule,
  recheckProposals,
  replaceLink,
  verifyLive,
} from "@seo/fixes";
import type { CheckableFix, FixKind, FixKindDef } from "@seo/fixes";
import { sameWpValue } from "@seo/integrations";
import type { JsonHttp, WpItem, WpRef, WpStatus, WpValue, WpWriteItem } from "@seo/integrations";
import { draftDescriptions, draftTitles } from "@seo/llm";
import type { LlmClient, PageExcerpt } from "@seo/llm";
import { TITLE_MAX, TITLE_MIN } from "@seo/rules";
import type { RuleOutcome } from "@seo/rules";
import type { RuleReport } from "@seo/scoring";
import { DbLlmCache } from "./llm-cache";
import { gunzip, snapshotKey } from "./storage";
import type { BlobStore } from "./storage";
import { wordPressClient } from "./wordpress";
import { stableKey } from "./issues";

export type Db = ScopedPrisma;

/** Verification retries after publishing (CDN caches): 5 minutes, 30 minutes, 24 hours. */
export const VERIFY_DELAYS_MS = [5 * 60_000, 30 * 60_000, 24 * 3_600_000];

export interface FixDeps {
  db: Db;
  blobs: BlobStore;
  llm: LlmClient | null;
  http: JsonHttp;
  now: () => Date;
  /** Fetcher for live verification (default: SSRF-guarded HTTP). */
  fetcher?: () => Fetcher;
  verifyDelays?: number[];
  /** Schedules the next verification attempt (BullMQ delayed job in production). */
  scheduleVerify?: (batchId: string, delayMs: number) => Promise<void>;
}

// ─── Loading ──────────────────────────────────────────────────────────────────

export async function loadSnapshot(
  blobs: BlobStore,
  organizationId: string,
  crawlId: string,
): Promise<CrawlSnapshot> {
  const buf = await blobs.get(snapshotKey(organizationId, crawlId));
  if (!buf) throw new Error("The audit snapshot is no longer stored. Run a new audit first.");
  return JSON.parse(gunzip(buf)) as CrawlSnapshot;
}

/** Rule results the batch is built from: the audit report, or the sitemap check results. */
async function ruleReport(db: Db, batch: BatchRow): Promise<RuleReport | null> {
  if (batch.sitemapCheckId) {
    const check = await db.sitemapCheck.findUniqueOrThrow({ where: { id: batch.sitemapCheckId } });
    return (
      ((check.results ?? []) as unknown as RuleReport[]).find((r) => r.ruleId === batch.ruleId) ??
      null
    );
  }
  if (!batch.crawlId) return null;
  const report = await db.report.findFirst({ where: { crawlId: batch.crawlId } });
  const rules = (report?.reportJson as { rules?: RuleReport[] } | null)?.rules ?? [];
  return rules.find((r) => r.ruleId === batch.ruleId) ?? null;
}

type BatchRow = Awaited<ReturnType<Db["fixBatch"]["findUniqueOrThrow"]>>;
type FixRow = Awaited<ReturnType<Db["fix"]["findUniqueOrThrow"]>>;

const snapshotIdOf = (batch: Pick<BatchRow, "crawlId" | "sitemapCheckId">): string =>
  batch.sitemapCheckId ?? batch.crawlId ?? "";

async function ownerIntent(db: Db, projectId: string): Promise<OwnerIntent> {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  return { aiCrawlers: project.aiCrawlerIntent };
}

async function wordpressFor(db: Db, projectId: string) {
  return db.integration.findFirst({ where: { projectId, type: "wordpress", status: "connected" } });
}

/** JSON column value; "not set" (null) is stored as SQL NULL and reads back as null. */
const json = (v: WpValue | undefined): Prisma.InputJsonValue | typeof Prisma.DbNull =>
  v === undefined || v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue);

// ─── Create + generate ────────────────────────────────────────────────────────

export interface CreateBatchArgs {
  projectId: string;
  organizationId: string;
  ruleId: string;
  userId: string | null;
  /** Audit to fix (site audit issues) … */
  crawlId?: string;
  /** … or sitemap check (M17 auto-fix). */
  sitemapCheckId?: string;
  /** Only these URLs (issue manager selection); all failing items when omitted. */
  urls?: string[];
}

/** Creates a batch in state "generating"; the fix queue fills it (generateFixBatch). */
export async function createFixBatch(db: Db, args: CreateBatchArgs): Promise<BatchRow> {
  const def = kindForRule(args.ruleId);
  if (!def)
    throw new Error(`${args.ruleId} has no automatic fix yet. Follow the guide on the issue page.`);
  const wp = await wordpressFor(db, args.projectId);
  const details = (wp?.details ?? {}) as Partial<WpStatus>;
  const targetDetail = wp
    ? `WordPress · ${def.field(details.seoPlugin ?? "core")}`
    : "No publishing target connected · download the approved values";
  for (let attempt = 0; ; attempt++) {
    const last = await db.fixBatch.findFirst({
      where: { projectId: args.projectId },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    try {
      return await db.fixBatch.create({
        data: {
          organizationId: args.organizationId,
          projectId: args.projectId,
          number: (last?.number ?? 0) + 1,
          ruleId: args.ruleId,
          kind: def.kind,
          risk: def.risk,
          source: def.drafted === "ai" ? "ai" : "user",
          target: wp ? "wordpress" : "manual",
          targetDetail,
          state: "generating",
          crawlId: args.crawlId ?? null,
          sitemapCheckId: args.sitemapCheckId ?? null,
          createdById: args.userId,
          error: args.urls ? JSON.stringify({ urls: args.urls }) : null,
        } as Prisma.FixBatchUncheckedCreateInput,
      });
    } catch (error) {
      // Two batches created at once can race for the same number; retry.
      if (attempt >= 3 || !/Unique constraint/i.test((error as Error).message)) throw error;
    }
  }
}

function excerptFor(snapshot: CrawlSnapshot, url: string): PageExcerpt {
  const page = snapshot.pages.find((p) => p.url === url);
  const html = page?.renderedHtml ?? page?.rawHtml ?? null;
  const facts = html ? extractPageFacts(html, url, page?.headers ?? {}) : null;
  return {
    url,
    title: facts?.title ?? null,
    headings: facts?.headings.slice(0, 20).map((h) => h.text) ?? [],
    text: facts?.mainText.split(" ").slice(0, 2000).join(" ") ?? "",
  };
}

/** AI drafts for text kinds; null values stay for the owner to type. */
async function drafts(
  def: FixKindDef,
  urls: string[],
  snapshot: CrawlSnapshot,
  deps: FixDeps,
): Promise<{ values: Map<string, string>; modelId: string | null; promptVersion: string | null }> {
  const empty = { values: new Map<string, string>(), modelId: null, promptVersion: null };
  if (def.drafted !== "ai" || urls.length === 0 || !deps.llm) return empty;
  const cache = new DbLlmCache(deps.db);
  const excerpts = urls.slice(0, 24).map((u) => excerptFor(snapshot, u));
  if (def.kind === "meta_description") {
    const result = await draftDescriptions(excerpts, { llm: deps.llm, cache });
    if (!result) return empty;
    return {
      values: new Map(result.output.drafts.map((d) => [d.url, d.description])),
      modelId: result.modelId,
      promptVersion: result.promptVersion,
    };
  }
  const site = buildSiteFacts(snapshot);
  const otherTitles = site.pages
    .filter((p) => p.isIndexable && p.facts?.title && !urls.includes(p.url))
    .map((p) => p.facts?.title ?? "")
    .slice(0, 50);
  const result = await draftTitles(
    excerpts.map((e) => ({ ...e, otherTitles })),
    { min: TITLE_MIN, max: TITLE_MAX },
    { llm: deps.llm, cache },
  );
  if (!result) return empty;
  return {
    values: new Map(result.output.drafts.map((d) => [d.url, d.title])),
    modelId: result.modelId,
    promptVersion: result.promptVersion,
  };
}

const wpItem = (def: FixKindDef, ref: WpRef): WpItem =>
  def.kind === "link"
    ? { field: "post_content", ref: { url: ref.url } }
    : { field: def.wpField, ref };

/** Fills a "generating" batch: candidates, plugin values, drafts, re-check. */
export async function generateFixBatch(batchId: string, deps: FixDeps): Promise<void> {
  const { db } = deps;
  const batch = await db.fixBatch.findUniqueOrThrow({ where: { id: batchId } });
  if (batch.state !== "generating") return;
  try {
    const def = FIX_KINDS[batch.kind as FixKind];
    const snapshot = await loadSnapshot(deps.blobs, batch.organizationId, snapshotIdOf(batch));
    const intent = await ownerIntent(db, batch.projectId);
    const rule = await ruleReport(db, batch);
    const only = batch.error ? new Set((JSON.parse(batch.error) as { urls: string[] }).urls) : null;
    const outcomes: RuleOutcome[] = (rule?.outcomes ?? []).filter(
      (o) => !only || (o.url && only.has(o.url)),
    );
    const site = buildSiteFacts(snapshot, { ownerIntent: intent });
    const candidates = buildCandidates(batch.ruleId, outcomes, site);

    // Exact current values from the site (what Yoast / Rank Math / WordPress store now).
    const wp = batch.target === "wordpress" ? await wordpressFor(db, batch.projectId) : null;
    const project = await db.project.findUniqueOrThrow({ where: { id: batch.projectId } });
    const client = wp ? wordPressClient(wp, project.rootUrl, deps.http, deps.now) : null;
    const reads =
      client && candidates.length
        ? await client.read(candidates.map((c) => wpItem(def, c.ref)))
        : [];

    const ai = await drafts(
      def,
      candidates.filter((c) => c.needsDraft).map((c) => c.url),
      snapshot,
      deps,
    );
    const proposals = candidates.map((c, i) => {
      const read = reads[i];
      const skipped = read?.error
        ? read.error === "not_found"
          ? "WordPress could not find this item (not a post, page or media file)."
          : `The plugin cannot change this: ${read.error}.`
        : def.kind === "sitemap_include" && read && read.value === false
          ? "Not excluded by the plugin; add it with the manual list."
          : c.suggestedValue === null && c.note && def.kind === "robots_sitemap"
            ? c.note
            : null;
      const suggested = c.needsDraft ? (ai.values.get(c.url) ?? null) : c.suggestedValue;
      const current = read && !read.error && def.kind !== "link" ? read.value : c.currentValue;
      return { c, id: String(i), skipped, suggested, current };
    });
    const checks = recheckProposals(
      snapshot,
      intent,
      proposals
        .filter((p) => !p.skipped)
        .map((p): CheckableFix => ({
          id: p.id,
          kind: def.kind,
          url: p.c.url,
          ref: p.c.ref,
          value: p.suggested,
        })),
    );

    await db.$transaction(async (tx) => {
      await tx.fix.createMany({
        data: proposals.map((p) => {
          const check = checks.get(p.id);
          const pass = check?.result === "pass";
          return {
            organizationId: batch.organizationId,
            projectId: batch.projectId,
            batchId,
            ruleId: batch.ruleId,
            url: p.c.url,
            kind: def.kind,
            targetRef: p.c.ref as Prisma.InputJsonValue,
            currentValue: json(p.current),
            suggestedValue: json(p.suggested),
            newValue: json(p.suggested),
            recheck: p.skipped ? "skipped" : (check?.result ?? "Empty"),
            recheckDetail: p.skipped ?? p.c.note ?? check?.detail ?? null,
            // Low-risk items that pass start ticked; high-risk items are approved one by one.
            approved: !p.skipped && pass && def.risk === "low",
            state: p.skipped ? "skipped" : "draft",
          } as Prisma.FixCreateManyInput;
        }),
      });
      await tx.fixBatch.update({
        where: { id: batchId },
        data: {
          state: "preview",
          error: candidates.length === 0 ? "Nothing to fix: the check passes in this audit." : null,
          modelId: ai.modelId,
          promptVersion: ai.promptVersion,
        },
      });
    });
  } catch (error) {
    await db.fixBatch.update({
      where: { id: batchId },
      data: { state: "failed", error: (error as Error).message.slice(0, 1000) },
    });
    throw error;
  }
}

// ─── Review edits ─────────────────────────────────────────────────────────────

/** Re-checks every draft fix of a batch together (catches duplicates between drafts). */
export async function recheckBatch(
  batchId: string,
  deps: Pick<FixDeps, "db" | "blobs">,
): Promise<void> {
  const { db } = deps;
  const batch = await db.fixBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: { fixes: true },
  });
  const drafts = batch.fixes.filter((f) => f.state === "draft");
  const snapshot = await loadSnapshot(deps.blobs, batch.organizationId, snapshotIdOf(batch));
  const checks = recheckProposals(
    snapshot,
    await ownerIntent(db, batch.projectId),
    drafts.map((f) => ({
      id: f.id,
      kind: f.kind as FixKind,
      url: f.url,
      ref: f.targetRef as WpRef,
      value: f.newValue as WpValue,
    })),
  );
  for (const f of drafts) {
    const check = checks.get(f.id);
    const result = check?.result ?? "Empty";
    await db.fix.update({
      where: { id: f.id },
      data: {
        recheck: result,
        recheckDetail: result === "pass" ? null : (check?.detail ?? null),
        // A value that no longer passes cannot stay approved.
        ...(result !== "pass" ? { approved: false } : {}),
      },
    });
  }
}

/** The owner edits a value in the review table. The rule engine re-checks it. */
export async function editFixValue(
  fixId: string,
  value: WpValue,
  userId: string,
  deps: Pick<FixDeps, "db" | "blobs">,
): Promise<FixRow> {
  const { db } = deps;
  const fix = await db.fix.findUniqueOrThrow({ where: { id: fixId }, include: { batch: true } });
  if (fix.batch.state !== "preview" || fix.state !== "draft") {
    throw new Error("Only drafts in a preview can be edited.");
  }
  await db.fix.update({
    where: { id: fixId },
    data: { newValue: json(value), edited: !sameWpValue(value, fix.suggestedValue as WpValue) },
  });
  await db.auditLog.create({
    data: {
      actorId: userId,
      action: "fix.edit",
      entityType: "fix",
      entityId: fixId,
      before: json(fix.newValue as WpValue),
      after: json(value),
      source: "user",
    } as Prisma.AuditLogUncheckedCreateInput,
  });
  await recheckBatch(fix.batchId, deps);
  return db.fix.findUniqueOrThrow({ where: { id: fixId } });
}

// ─── Approve + publish ────────────────────────────────────────────────────────

export class FixError extends Error {}

/**
 * Approves the given fixes and marks the batch for publishing. Rules: the project's domain is
 * verified, a publishing target is connected, every approved value passed the re-check, and
 * high-risk batches list each approved item explicitly.
 */
export async function approveFixBatch(
  batchId: string,
  fixIds: readonly string[],
  userId: string | null,
  deps: Pick<FixDeps, "db" | "now">,
): Promise<{ approved: number }> {
  const { db } = deps;
  const batch = await db.fixBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: { fixes: true, project: true },
  });
  if (batch.state !== "preview") throw new FixError("This batch is not waiting for approval.");
  if (batch.target !== "wordpress") {
    throw new FixError(
      "No publishing target is connected. Connect WordPress or download the values.",
    );
  }
  if (!batch.project.verifiedAt) {
    throw new FixError("Verify that you own this domain before publishing fixes.");
  }
  if (!(await wordpressFor(db, batch.projectId))) {
    throw new FixError(
      "The WordPress connection is not working. Check it on the Integrations page.",
    );
  }
  const wanted = new Set(fixIds);
  const chosen = batch.fixes.filter((f) => wanted.has(f.id) && f.state === "draft");
  if (chosen.length === 0) throw new FixError("Select at least one change to publish.");
  const failing = chosen.filter((f) => f.recheck !== "pass");
  if (failing.length) {
    throw new FixError(
      `${failing.length} selected change(s) did not pass the re-check. Edit them first.`,
    );
  }
  const now = deps.now();
  await db.$transaction(async (tx) => {
    await tx.fix.updateMany({ where: { batchId }, data: { approved: false } });
    await tx.fix.updateMany({
      where: { id: { in: chosen.map((f) => f.id) } },
      data: { approved: true },
    });
    await tx.fixBatch.update({
      where: { id: batchId },
      data: { state: "publishing", approvedById: userId, approvedAt: now, error: null },
    });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "fix.batch.approve",
        entityType: "fix_batch",
        entityId: batchId,
        after: { fixes: chosen.map((f) => f.id), risk: batch.risk } as Prisma.InputJsonValue,
        source: "user",
      } as Prisma.AuditLogUncheckedCreateInput,
    });
  });
  return { approved: chosen.length };
}

/** The value written to the plugin for a fix (link and robots fixes depend on the old value). */
export function writtenValue(
  kind: FixKind,
  fix: Pick<FixRow, "url" | "targetRef" | "newValue">,
  old: WpValue,
): WpValue {
  const value = fix.newValue as WpValue;
  const ref = fix.targetRef as WpRef;
  switch (kind) {
    case "link":
      return replaceLink(String(old ?? ""), fix.url, ref.from ?? "", String(value)).content;
    case "robots_sitemap": {
      const lines = Array.isArray(old) ? old : [];
      return [...lines, ...(Array.isArray(value) ? value : []).filter((l) => !lines.includes(l))];
    }
    default:
      return value;
  }
}

async function setIssueStatus(
  db: Db,
  projectId: string,
  fixes: Pick<FixRow, "ruleId" | "url">[],
  status: "fixed" | "verified" | "open",
): Promise<void> {
  const keys = [
    ...new Set(fixes.map((f) => stableKey(f.ruleId, f.url.endsWith("/robots.txt") ? null : f.url))),
  ];
  if (keys.length === 0) return;
  await db.issueItem.updateMany({
    where: { projectId, stableKey: { in: keys }, status: { not: "ignored" } },
    data: { status },
  });
}

/** Publishes approved fixes through the plugin. The old value is saved before each write. */
export async function applyFixBatch(batchId: string, deps: FixDeps): Promise<void> {
  const { db } = deps;
  const batch = await db.fixBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: { fixes: true, project: true },
  });
  if (batch.state !== "publishing") return;
  const def = FIX_KINDS[batch.kind as FixKind];
  const wp = await wordpressFor(db, batch.projectId);
  if (!wp) {
    await db.fixBatch.update({
      where: { id: batchId },
      data: { state: "preview", error: "WordPress is not connected." },
    });
    return;
  }
  const client = wordPressClient(wp, batch.project.rootUrl, deps.http, deps.now);
  const fixes = batch.fixes.filter((f) => f.approved && f.state === "draft");
  const items = fixes.map((f) => wpItem(def, f.targetRef as WpRef));

  // 1. Read and store the old values first (CLAUDE.md rule 5).
  const reads = await client.read(items);
  for (const [i, f] of fixes.entries()) {
    const read = reads[i];
    await db.fix.update({
      where: { id: f.id },
      data: read?.error
        ? { state: "failed", error: `Could not read the current value: ${read.error}` }
        : { oldValue: json(read?.value ?? null), oldValueRead: true },
    });
  }
  const ready = fixes.filter((_, i) => !reads[i]?.error);

  // 2. Write, conditional on the value still being the one we read.
  const writes: WpWriteItem[] = ready.map((f) => {
    const old = reads[fixes.indexOf(f)]?.value ?? null;
    return {
      ...wpItem(def, f.targetRef as WpRef),
      value: writtenValue(def.kind, f, old),
      expect: old,
    };
  });
  const results = writes.length ? await client.write(writes) : [];
  const now = deps.now();
  const applied: FixRow[] = [];
  for (const [i, f] of ready.entries()) {
    const r = results[i];
    if (r?.ok) applied.push(f);
    await db.fix.update({
      where: { id: f.id },
      data: r?.ok
        ? { state: "applied", appliedAt: now, error: null }
        : {
            state: "failed",
            error:
              r?.error === "conflict"
                ? "The value changed on the site after the preview; nothing was written."
                : `Write failed: ${r?.error ?? "unknown"}`,
          },
    });
    await db.auditLog.create({
      data: {
        actorId: batch.approvedById,
        action: r?.ok ? "fix.apply" : "fix.apply.failed",
        entityType: "fix",
        entityId: f.id,
        before: json(writes[i]?.expect ?? null),
        after: json(r?.ok ? (writes[i]?.value ?? null) : null),
        source: batch.source,
      } as Prisma.AuditLogUncheckedCreateInput,
    });
  }
  await setIssueStatus(db, batch.projectId, applied, "fixed");
  await db.fixBatch.update({
    where: { id: batchId },
    data: applied.length
      ? { state: "verifying", publishedAt: now, verifyAttempts: 0 }
      : { state: "failed", error: "No change could be published." },
  });
  if (applied.length) await verifyFixBatch(batchId, deps);
}

// ─── Verify ───────────────────────────────────────────────────────────────────

const toCheckable = (f: FixRow): CheckableFix => ({
  id: f.id,
  kind: f.kind as FixKind,
  url: f.url,
  ref: f.targetRef as WpRef,
  value: f.newValue as WpValue,
});

/** Re-crawls the changed URLs and re-runs the rule; schedules a retry or rolls back. */
export async function verifyFixBatch(batchId: string, deps: FixDeps): Promise<FixBatchState> {
  const { db } = deps;
  const batch = await db.fixBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: { fixes: true },
  });
  if (batch.state !== "verifying" && batch.state !== "rechecking") return batch.state;
  const pending = batch.fixes.filter((f) => f.state === "applied");
  const delays = deps.verifyDelays ?? VERIFY_DELAYS_MS;
  const attempt = batch.verifyAttempts + 1;
  const snapshot = await loadSnapshot(deps.blobs, batch.organizationId, snapshotIdOf(batch));
  const fetcher = deps.fetcher?.() ?? new HttpFetcher();
  let results;
  try {
    results = await verifyLive(
      snapshot,
      await ownerIntent(db, batch.projectId),
      pending.map(toCheckable),
      fetcher,
    );
  } finally {
    if (fetcher instanceof HttpFetcher) await fetcher.close();
  }
  const now = deps.now();
  const verified: FixRow[] = [];
  for (const f of pending) {
    const r = results.get(f.id);
    if (!r) continue;
    const data = {
      before: "fail",
      after: r.verified ? "pass" : "fail",
      observed: r.observed,
      reason: r.reason,
      attempts: attempt,
      checkedAt: now.toISOString(),
    };
    await db.fix.update({
      where: { id: f.id },
      data: r.verified
        ? { state: "verified", verifiedAt: now, verification: data as Prisma.InputJsonValue }
        : { verification: data as Prisma.InputJsonValue },
    });
    if (r.verified) verified.push(f);
  }
  await setIssueStatus(db, batch.projectId, verified, "verified");
  const stillFailing = pending.filter((f) => !results.get(f.id)?.verified);

  if (stillFailing.length === 0) {
    await db.fixBatch.update({
      where: { id: batchId },
      data: { state: "verified", verifiedAt: now, verifyAttempts: attempt, nextVerifyAt: null },
    });
    return "verified";
  }
  const delay = delays[attempt - 1];
  if (delay !== undefined) {
    await db.fixBatch.update({
      where: { id: batchId },
      data: {
        state: "rechecking",
        verifyAttempts: attempt,
        nextVerifyAt: new Date(now.getTime() + delay),
      },
    });
    await deps.scheduleVerify?.(batchId, delay);
    return "rechecking";
  }
  // Out of retries: undo what never verified (REQUIREMENTS M14 "Failed → automatic rollback").
  await rollbackFixes(
    batchId,
    stillFailing.map((f) => f.id),
    null,
    deps,
    "verify_failed",
  );
  await db.fixBatch.update({
    where: { id: batchId },
    data: { state: "verify_failed", verifyAttempts: attempt, nextVerifyAt: null },
  });
  if (batch.approvedById) {
    await db.notification.create({
      data: {
        userId: batch.approvedById,
        type: "alert",
        title: `Fix batch B-${String(batch.number).padStart(4, "0")} did not verify`,
        body: `${stillFailing.length} change(s) were rolled back automatically.`,
        link: `/projects/${batch.projectId}/changes`,
      } as Prisma.NotificationUncheckedCreateInput,
    });
  }
  return "verify_failed";
}

// ─── Rollback ─────────────────────────────────────────────────────────────────

const ROLLBACKABLE: FixState[] = ["applied", "verified", "verify_failed"];

/**
 * Restores the saved old values (per item or the whole batch). The write only happens when the
 * site still shows the value we published; afterwards the plugin value is read back and compared
 * with the saved old value.
 */
export async function rollbackFixes(
  batchId: string,
  fixIds: readonly string[] | null,
  userId: string | null,
  deps: Pick<FixDeps, "db" | "http" | "now">,
  finalState: "rolled_back" | "verify_failed" = "rolled_back",
): Promise<{ rolledBack: number; failed: { id: string; error: string }[] }> {
  const { db } = deps;
  const batch = await db.fixBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: { fixes: true, project: true },
  });
  const def = FIX_KINDS[batch.kind as FixKind];
  const targets = batch.fixes.filter(
    (f) => ROLLBACKABLE.includes(f.state) && f.oldValueRead && (!fixIds || fixIds.includes(f.id)),
  );
  const out = { rolledBack: 0, failed: [] as { id: string; error: string }[] };
  if (targets.length === 0) return out;
  const wp = await wordpressFor(db, batch.projectId);
  if (!wp)
    throw new FixError("WordPress is not connected, so nothing can be rolled back automatically.");
  const client = wordPressClient(wp, batch.project.rootUrl, deps.http, deps.now);
  const writes: WpWriteItem[] = targets.map((f) => ({
    ...wpItem(def, f.targetRef as WpRef),
    value: f.oldValue as WpValue,
    expect: writtenValue(def.kind, f, f.oldValue as WpValue),
  }));
  const results = await client.write(writes);
  const readBack = await client.read(writes.map(({ field, ref }) => ({ field, ref })));
  const now = deps.now();
  const restored: FixRow[] = [];
  for (const [i, f] of targets.entries()) {
    const ok = results[i]?.ok && sameWpValue(readBack[i]?.value ?? null, f.oldValue as WpValue);
    const error =
      results[i]?.error === "conflict"
        ? "The value was changed on the site after publishing; it was not overwritten."
        : !ok
          ? `Rollback failed: ${results[i]?.error ?? "value did not match after writing"}`
          : null;
    if (ok) {
      out.rolledBack++;
      restored.push(f);
    } else out.failed.push({ id: f.id, error: error ?? "unknown" });
    await db.fix.update({
      where: { id: f.id },
      data: ok
        ? {
            state: finalState === "verify_failed" ? "verify_failed" : "rolled_back",
            rolledBackAt: now,
          }
        : { error },
    });
    await db.auditLog.create({
      data: {
        actorId: userId,
        action: ok ? (userId ? "fix.rollback" : "fix.rollback.auto") : "fix.rollback.failed",
        entityType: "fix",
        entityId: f.id,
        before: json(writes[i]?.expect ?? null),
        after: json(ok ? (f.oldValue as WpValue) : null),
        source: userId ? "user" : "system",
      } as Prisma.AuditLogUncheckedCreateInput,
    });
  }
  await setIssueStatus(db, batch.projectId, restored, "open");
  if (finalState === "rolled_back") {
    const left = await db.fix.count({ where: { batchId, state: { in: ROLLBACKABLE } } });
    await db.fixBatch.update({
      where: { id: batchId },
      data:
        left === 0
          ? { state: "rolled_back", rolledBackAt: now, rolledBackById: userId, nextVerifyAt: null }
          : {},
    });
  }
  return out;
}

/** "Re-apply" a rolled-back batch: the same values go through publish and verify again. */
export async function reapplyFixBatch(
  batchId: string,
  userId: string,
  deps: Pick<FixDeps, "db" | "now">,
): Promise<void> {
  const { db } = deps;
  const batch = await db.fixBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: { project: true },
  });
  if (batch.state !== "rolled_back" && batch.state !== "verify_failed") {
    throw new FixError("Only rolled-back batches can be re-applied.");
  }
  if (!batch.project.verifiedAt) throw new FixError("Verify that you own this domain first.");
  await db.$transaction(async (tx) => {
    await tx.fix.updateMany({
      where: { batchId, state: { in: ["rolled_back", "verify_failed"] } },
      data: {
        state: "draft",
        approved: true,
        oldValue: json(null),
        oldValueRead: false,
        error: null,
        rolledBackAt: null,
        verifiedAt: null,
      },
    });
    await tx.fixBatch.update({
      where: { id: batchId },
      data: {
        state: "publishing",
        approvedById: userId,
        approvedAt: deps.now(),
        rolledBackAt: null,
        verifyAttempts: 0,
      },
    });
  });
}
