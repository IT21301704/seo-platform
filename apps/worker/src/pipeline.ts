// The 6-stage audit (screen 02): Discover → Crawl → Render → Performance → Run checks → Explain.
import {
  buildSiteFacts,
  crawlSite,
  performanceSample,
  renderSnapshot,
  snapshotSetHash,
} from "@seo/crawler";
import type { CrawlEvent, CrawlSnapshot, Fetcher, Renderer, SiteFacts } from "@seo/crawler";
import type { Prisma, PrismaClient, ScopedPrisma } from "@seo/db";
import type { JsonHttp } from "@seo/integrations";
import { explainIssue } from "@seo/llm";
import type { LlmClient } from "@seo/llm";
import { RULES_BY_ID } from "@seo/rules";
import { runAudit, serializeReport } from "@seo/scoring";
import type { AuditReport } from "@seo/scoring";
import { CODE_VERSIONS, stableStringify } from "@seo/shared";
import { createHash } from "node:crypto";
import { gscExternalFor } from "./external";
import type { SyncResult } from "./issues";
import { DbLlmCache } from "./llm-cache";
import { diffAudits, triggeredAlerts } from "./monitoring";
import type { RuleSetting } from "./monitoring";
import { deliverAlerts, notifyEditors, notifyUser } from "./notify";
import type { Mailer } from "./notify";
import { persistAudit } from "./persist";
import type { ProgressReporter } from "./progress";
import { sourceFor } from "./source";
import type { SourceDeps } from "./source";
import { gzip, htmlKey, snapshotKey } from "./storage";
import type { BlobStore } from "./storage";
import { queueWebhookEvent } from "./webhooks";

export const DEFAULT_LLM_BUDGET = 30;

class CancelledError extends Error {}

export interface PipelineDeps extends SourceDeps {
  prisma: PrismaClient;
  db: ScopedPrisma;
  blobs: BlobStore;
  llm: LlmClient | null;
  progress: ProgressReporter | null;
  makeRenderer: (fetcher: Fetcher) => Renderer & { close?: () => Promise<void> };
  now: () => Date;
  /** Max Claude explanations per audit (plan cap, REQUIREMENTS M7). */
  llmBudget?: number;
  /** Alert delivery (M10). Without it, monitoring events are still recorded but no alert is sent. */
  alerts?: { http: JsonHttp; mailer: Mailer; appUrl: string };
}

/** Alert rules when a project has not configured any (REQUIREMENTS M10 defaults). */
export const DEFAULT_ALERT_RULES: RuleSetting[] = [
  { type: "score_drop", enabled: true, threshold: 5 },
  { type: "new_critical", enabled: true, threshold: null },
  { type: "noindex", enabled: true, threshold: null },
  { type: "weekly_summary", enabled: false, threshold: null },
];

export async function runPipeline(crawlId: string, deps: PipelineDeps): Promise<AuditReport> {
  const { db } = deps;
  const crawl = await db.crawl.findUniqueOrThrow({
    where: { id: crawlId },
    include: { project: true },
  });
  const project = crawl.project;
  const report = (msg: string, status: number | null = null) => deps.progress?.log(msg, status);
  const stage = (...args: Parameters<ProgressReporter["stage"]>) => deps.progress?.stage(...args);
  // Stage boundary: stop if the user cancelled, otherwise record the new status.
  const setStatus = async (
    status: "crawling" | "rendering" | "performance" | "checking" | "explaining",
  ) => {
    const current = await db.crawl.findUniqueOrThrow({
      where: { id: crawlId },
      select: { status: true },
    });
    if (current.status === "cancelled") throw new CancelledError("Audit cancelled");
    await db.crawl.update({ where: { id: crawlId }, data: { status } });
  };

  await db.crawl.update({
    where: { id: crawlId },
    data: { status: "discovering", startedAt: deps.now(), error: null },
  });
  const source = await sourceFor(crawl, project, deps);
  try {
    // 1–2 · Discover + crawl
    await stage("discover", { state: "running", detail: "Reading robots.txt and sitemaps" });
    let crawled = 0;
    const onProgress = (e: CrawlEvent) => {
      if (e.stage === "discover") void stage("discover", { state: "done", detail: e.message });
      if (e.stage === "crawl") {
        crawled = e.done ?? crawled;
        void stage("crawl", {
          state: "running",
          detail: "Status codes, redirects, canonicals, meta, headings, links, images",
          done: crawled,
          total: project.pageLimit,
        });
        void report(e.message, e.status ?? null);
        if (crawled % 10 === 0)
          void db.crawl.update({ where: { id: crawlId }, data: { pagesCrawled: crawled } });
      }
    };
    await setStatus("crawling");
    let snapshot: CrawlSnapshot = await crawlSite({
      rootUrl: project.rootUrl,
      fetcher: source.fetcher,
      pageLimit: project.pageLimit,
      crawledAt: source.crawledAt,
      inputType: crawl.inputType,
      onProgress,
    });
    await stage("crawl", {
      state: "done",
      detail: `${snapshot.pages.length} URLs crawled`,
      done: snapshot.pages.length,
      total: project.pageLimit,
    });

    // 3 · Render
    await setStatus("rendering");
    await stage("render", {
      state: "running",
      detail: "Headless browser for pages that need JavaScript",
    });
    const renderer = deps.makeRenderer(source.fetcher);
    try {
      snapshot = await renderSnapshot(snapshot, renderer, (e) => void report(e.message));
    } finally {
      await renderer.close?.();
    }
    const rendered = snapshot.pages.filter((p) => p.renderedHtml !== null).length;
    await stage("render", {
      state: "done",
      detail: `${rendered} pages rendered`,
      done: rendered,
      total: snapshot.pages.length,
    });

    // 4 · Performance
    await setStatus("performance");
    await stage("performance", {
      state: "running",
      detail: "Real-user Core Web Vitals (CrUX) or median of 5 lab runs",
    });
    const sampleSize = Number(process.env["PERF_SAMPLE_PAGES"] ?? 5);
    snapshot = {
      ...snapshot,
      performance: await source.performance.measure(performanceSample(snapshot, sampleSize)),
    };
    await stage("performance", {
      state: "done",
      detail: snapshot.performance.note ?? `${snapshot.performance.pages.length} pages measured`,
    });

    // Dated Search Console data becomes part of the snapshot (and of its hash).
    const gsc = crawl.inputType === "url" ? await gscExternalFor(db, project.id) : null;
    snapshot = { ...snapshot, external: { gsc } };

    // Store snapshots (content-addressed HTML + the full snapshot).
    const snapshotPaths = await storeSnapshots(deps.blobs, crawl.organizationId, crawlId, snapshot);
    const setHash = snapshotSetHash(snapshot);

    // 5 · Run checks — or reuse the identical earlier report (same snapshot + same versions).
    await setStatus("checking");
    await stage("checks", {
      state: "running",
      detail: `${RULES_BY_ID.size} rule-based checks. No AI involved in scoring.`,
    });
    const ownerIntent = { aiCrawlers: project.aiCrawlerIntent };
    const cached = await findCachedReport(db, project.id, crawlId, setHash);
    let auditReport: AuditReport;
    let reportHash: string;
    let site: SiteFacts;
    if (cached) {
      auditReport = cached.report;
      reportHash = cached.reportHash;
      site = buildSiteFacts(snapshot, { ownerIntent });
      await report(`Site unchanged: reusing the report of audit ${cached.crawlId}`);
    } else {
      const result = runAudit(snapshot, { ownerIntent });
      auditReport = result.report;
      reportHash = result.reportHash;
      site = result.site;
    }
    const sync = await persistAudit(db, {
      crawlId,
      projectId: project.id,
      site,
      report: auditReport,
      reportHash,
      snapshotPaths,
      now: deps.now(),
      source: crawl.trigger === "scheduled" ? "monitoring" : "site_audit",
    });
    await db.crawl.update({
      where: { id: crawlId },
      data: {
        gscSnapshotId: gsc?.snapshotId ?? null,
        snapshotSetHash: setHash,
        healthScore: auditReport.score.health,
        reportHash,
        reusedFromCrawlId: cached?.crawlId ?? null,
        pagesFound:
          snapshot.pages.length + snapshot.robotsBlocked.length + snapshot.unfetched.length,
        pagesCrawled: snapshot.pages.length,
        pagesRendered: rendered,
      },
    });
    await stage("checks", {
      state: "done",
      detail: `Health Score ${auditReport.score.health ?? "—"}`,
    });

    // 6 · Explain (failed checks only; never changes the score)
    await setStatus("explaining");
    await explainFailures(deps, project.id, site, auditReport);

    await db.crawl.update({
      where: { id: crawlId },
      data: { status: "completed", finishedAt: deps.now() },
    });
    await afterAudit(deps, { id: project.id, name: project.name }, crawlId, auditReport, sync);
    await report("Audit complete");
    return auditReport;
  } catch (error) {
    if (error instanceof CancelledError) {
      await report("Audit cancelled");
      throw error;
    }
    await db.crawl.update({
      where: { id: crawlId },
      data: {
        status: "failed",
        finishedAt: deps.now(),
        error: (error as Error).message.slice(0, 1000),
      },
    });
    await report(`Audit failed: ${(error as Error).message}`);
    throw error;
  } finally {
    await source.cleanup();
  }
}

async function storeSnapshots(
  blobs: BlobStore,
  organizationId: string,
  crawlId: string,
  snapshot: CrawlSnapshot,
): Promise<Map<string, string>> {
  const paths = new Map<string, string>();
  for (const page of snapshot.pages) {
    const html = page.renderedHtml ?? page.rawHtml;
    const hash = page.renderedHash ?? page.rawHash;
    if (html === null || hash === null) continue;
    const key = htmlKey(organizationId, hash);
    await blobs.put(key, gzip(html), "application/gzip");
    paths.set(page.url, key);
  }
  await blobs.put(
    snapshotKey(organizationId, crawlId),
    gzip(stableStringify(snapshot)),
    "application/gzip",
  );
  return paths;
}

async function findCachedReport(
  db: ScopedPrisma,
  projectId: string,
  crawlId: string,
  setHash: string,
): Promise<{ crawlId: string; report: AuditReport; reportHash: string } | null> {
  const previous = await db.crawl.findFirst({
    where: {
      projectId,
      id: { not: crawlId },
      status: "completed",
      snapshotSetHash: setHash,
      crawlerVersion: CODE_VERSIONS.crawlerVersion,
      rulesetVersion: CODE_VERSIONS.rulesetVersion,
      weightsVersion: CODE_VERSIONS.weightsVersion,
    },
    orderBy: { createdAt: "desc" },
    include: { report: true },
  });
  if (!previous?.report) return null;
  const report = previous.report.reportJson as unknown as AuditReport;
  // Guard: the stored JSON must still serialise to the stored hash.
  const hash = createHash("sha256").update(serializeReport(report)).digest("hex");
  if (hash !== previous.report.reportHash) return null;
  return { crawlId: previous.id, report, reportHash: previous.report.reportHash };
}

async function explainFailures(
  deps: PipelineDeps,
  projectId: string,
  site: SiteFacts,
  report: AuditReport,
): Promise<void> {
  const failing = report.rules
    .filter((r) => r.status === "fail")
    .sort((a, b) => b.priority.priority - a.priority.priority || a.ruleId.localeCompare(b.ruleId));
  const budget = deps.llmBudget ?? DEFAULT_LLM_BUDGET;
  const cache = new DbLlmCache(deps.db);
  let done = 0;
  await deps.progress?.stage("explain", {
    state: "running",
    detail: "AI writes explanations and fix steps for failed checks only",
    done,
    total: failing.length,
  });
  for (const [index, ruleReport] of failing.entries()) {
    const rule = RULES_BY_ID.get(ruleReport.ruleId);
    if (!rule) continue;
    const items = ruleReport.outcomes
      .filter((o) => o.result === "fail")
      .map((o) => ({ url: o.url, evidence: o.evidence }));
    const firstUrl = items.find((i) => i.url !== null)?.url ?? null;
    const facts = firstUrl ? site.pageByUrl.get(firstUrl)?.facts : null;
    const excerpt =
      firstUrl && facts
        ? {
            url: firstUrl,
            title: facts.title,
            headings: facts.headings.slice(0, 20).map((h) => h.text),
            text: facts.mainText.split(" ").slice(0, 2000).join(" "),
          }
        : null;
    // Over budget: the template explanation is used (no API call).
    const result = await explainIssue(
      { rule, items, excerpt },
      { llm: index < budget ? deps.llm : null, cache },
    );
    await deps.db.issue.updateMany({
      where: { projectId, ruleId: rule.id },
      data: { explanationKey: result.cacheKey },
    });
    done += 1;
    await deps.progress?.stage("explain", {
      state: "running",
      detail: `${done} of ${failing.length} issues explained`,
      done,
      total: failing.length,
    });
  }
  await deps.progress?.stage("explain", {
    state: "done",
    detail: `${done} issues explained`,
    done,
    total: failing.length,
  });
}

/**
 * After an audit (M10/M11/M19): record what changed since the previous audit, send alerts,
 * notify people about regressed items, and fire the audit.completed webhook.
 */
async function afterAudit(
  deps: PipelineDeps,
  project: { id: string; name: string },
  crawlId: string,
  report: AuditReport,
  sync: SyncResult,
): Promise<void> {
  const { db } = deps;
  const previous = await db.crawl.findFirst({
    where: { projectId: project.id, status: "completed", id: { not: crawlId } },
    orderBy: { createdAt: "desc" },
    include: { report: true },
  });
  const events = diffAudits(
    (previous?.report?.reportJson as unknown as AuditReport | undefined) ?? null,
    report,
  );
  await db.monitoringEvent.createMany({
    data: events.map((e) => ({
      projectId: project.id,
      crawlId,
      type: e.type,
      level: e.level,
      message: e.message,
      data: e.data as Prisma.InputJsonValue,
      createdAt: deps.now(),
    })) as Prisma.MonitoringEventCreateManyInput[],
  });

  const base = deps.alerts?.appUrl ?? "";
  if (previous && deps.alerts) {
    const stored = await db.alertRule.findMany({ where: { projectId: project.id } });
    const rules: RuleSetting[] = stored.length
      ? stored.map((r) => ({ type: r.type, enabled: r.enabled, threshold: r.threshold }))
      : DEFAULT_ALERT_RULES;
    await deliverAlerts(db, project.id, project.name, triggeredAlerts(events, rules), {
      ...deps.alerts,
      link: `${base}/projects/${project.id}/monitoring`,
    });
  }

  for (const item of sync.regressed) {
    const n = {
      type: "regressed",
      title: `${item.ruleId} is back on ${new URL(item.url).pathname}`,
      body: "An issue that was verified as fixed failed again in the latest audit.",
      link: `${base}/projects/${project.id}/issues/${item.ruleId}`,
    };
    if (item.assigneeId) await notifyUser(db, item.assigneeId, n);
  }
  const unassigned = sync.regressed.filter((r) => !r.assigneeId).length;
  if (unassigned) {
    await notifyEditors(db, {
      type: "regressed",
      title: `${unassigned} issue${unassigned === 1 ? "" : "s"} regressed`,
      body: "Items verified as fixed failed again in the latest audit.",
      link: `${base}/projects/${project.id}/issues?status=all`,
    });
  }

  await queueWebhookEvent(db, project.id, "audit.completed", {
    crawlId,
    projectId: project.id,
    score: report.score.health,
    versions: {
      crawler: report.versions.crawlerVersion,
      ruleset: report.versions.rulesetVersion,
      weights: report.versions.weightsVersion,
      snapshotSetHash: report.versions.snapshotSetHash,
    },
    counts: report.counts,
  });
}
