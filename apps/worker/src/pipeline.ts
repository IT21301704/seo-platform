// The 6-stage audit (screen 02): Discover → Crawl → Render → Performance → Run checks → Explain.
import {
  HttpFetcher,
  NO_PERFORMANCE,
  PsiPerformance,
  RecordedPerformance,
  buildSiteFacts,
  crawlSite,
  loadFixtureSite,
  performanceSample,
  renderSnapshot,
  snapshotSetHash,
} from "@seo/crawler";
import type {
  CrawlEvent,
  CrawlSnapshot,
  Fetcher,
  PerformanceSource,
  Renderer,
  SiteFacts,
} from "@seo/crawler";
import type { PrismaClient, ScopedPrisma } from "@seo/db";
import { explainIssue } from "@seo/llm";
import type { LlmClient } from "@seo/llm";
import { RULES_BY_ID } from "@seo/rules";
import { runAudit, serializeReport } from "@seo/scoring";
import type { AuditReport } from "@seo/scoring";
import { CODE_VERSIONS, stableStringify } from "@seo/shared";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { codeFetcher, readZip } from "./code-upload";
import { DbLlmCache } from "./llm-cache";
import { persistAudit } from "./persist";
import type { ProgressReporter } from "./progress";
import { gzip, htmlKey, snapshotKey, uploadKey } from "./storage";
import type { BlobStore } from "./storage";

export const DEFAULT_LLM_BUDGET = 30;

class CancelledError extends Error {}
const FIXTURES_DIR = fileURLToPath(new URL("../../../fixtures", import.meta.url));

export interface PipelineDeps {
  prisma: PrismaClient;
  db: ScopedPrisma;
  blobs: BlobStore;
  llm: LlmClient | null;
  progress: ProgressReporter | null;
  makeRenderer: (fetcher: Fetcher) => Renderer & { close?: () => Promise<void> };
  now: () => Date;
  /** Max Claude explanations per audit (plan cap, REQUIREMENTS M7). */
  llmBudget?: number;
  /** Dev/seed only: crawl this fixture folder instead of the network. */
  fixture?: { name: string; crawledAt?: string };
}

interface Source {
  fetcher: Fetcher;
  performance: PerformanceSource;
  crawledAt: string;
  cleanup: () => Promise<void>;
}

/** Picks where pages come from: an uploaded ZIP, a dev fixture, or the live site. */
async function sourceFor(
  crawl: { id: string; inputType: "url" | "code"; organizationId: string },
  project: { rootUrl: string },
  deps: PipelineDeps,
): Promise<Source> {
  const now = deps.now().toISOString();
  if (crawl.inputType === "code") {
    const key = uploadKey(crawl.organizationId, crawl.id);
    const zip = await deps.blobs.get(key);
    if (!zip) throw new Error("Uploaded code not found");
    const files = await readZip(zip);
    // Uploaded code is deleted as soon as the audit has read it (retention).
    return {
      fetcher: codeFetcher(files, new URL(project.rootUrl).origin),
      performance: NO_PERFORMANCE,
      crawledAt: now,
      cleanup: () => deps.blobs.delete(key),
    };
  }
  const fixtureName =
    deps.fixture?.name ??
    (process.env["FIXTURE_SITES"] === "true" &&
    new URL(project.rootUrl).hostname === "example-store.com"
      ? (process.env["FIXTURE_SITE_NAME"] ?? "golden-site")
      : null);
  if (fixtureName) {
    const dir =
      fixtureName === "golden-site"
        ? `${FIXTURES_DIR}/golden-site`
        : `${FIXTURES_DIR}/broken-sites/${fixtureName}`;
    const site = loadFixtureSite(dir);
    return {
      fetcher: site.fetcher,
      performance: new RecordedPerformance(site.server.performance),
      crawledAt: deps.fixture?.crawledAt ?? site.server.crawledAt,
      cleanup: async () => undefined,
    };
  }
  const fetcher = new HttpFetcher();
  const psiKey = process.env["PSI_API_KEY"];
  return {
    fetcher,
    performance: psiKey
      ? new PsiPerformance(psiKey, new HttpFetcher({ requestsPerSecond: 1, timeoutMs: 90_000 }))
      : NO_PERFORMANCE,
    crawledAt: now,
    cleanup: () => fetcher.close(),
  };
}

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
    await persistAudit(db, {
      crawlId,
      projectId: project.id,
      site,
      report: auditReport,
      reportHash,
      snapshotPaths,
      now: deps.now(),
    });
    await db.crawl.update({
      where: { id: crawlId },
      data: {
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
