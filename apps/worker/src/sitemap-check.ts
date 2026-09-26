// Sitemap check job (REQUIREMENTS M17): discover → validate → check every listed URL → compare
// with the crawl → Search Console → issues, lists and a Sitemap score. No auto-fix yet (Phase 3).
import { buildSiteFacts, crawlSite } from "@seo/crawler";
import type { Prisma, PrismaClient, ScopedPrisma } from "@seo/db";
import { RULES, runRules } from "@seo/rules";
import { buildReport } from "@seo/scoring";
import { CODE_VERSIONS } from "@seo/shared";
import { gscExternalFor } from "./external";
import { syncIssues } from "./issues";
import { sitemapFiles, sitemapSummary, sitemapUrlRows } from "./sitemap-lists";
import { sourceFor } from "./source";
import type { SourceDeps } from "./source";
import { queueWebhookEvent } from "./webhooks";

export const SITEMAP_RULES = RULES.filter((r) => r.category === "sitemap");
const SITEMAP_RULE_IDS = new Set(SITEMAP_RULES.map((r) => r.id));

export { newCheckId } from "./crawls";

export interface SitemapCheckDeps extends SourceDeps {
  prisma: PrismaClient;
  db: ScopedPrisma;
}

/** Runs a queued check; returns the webhook delivery ids it queued. */
export async function runSitemapCheck(checkId: string, deps: SitemapCheckDeps): Promise<string[]> {
  const { db } = deps;
  const check = await db.sitemapCheck.findUniqueOrThrow({
    where: { id: checkId },
    include: { project: true },
  });
  const project = check.project;
  await db.sitemapCheck.update({
    where: { id: checkId },
    data: { status: "running", error: null },
  });
  const source = await sourceFor(
    { id: checkId, inputType: "url", organizationId: check.organizationId },
    project,
    deps,
  );
  try {
    let snapshot = await crawlSite({
      rootUrl: project.rootUrl,
      fetcher: source.fetcher,
      pageLimit: project.pageLimit,
      crawledAt: source.crawledAt,
    });
    const gsc = await gscExternalFor(db, project.id);
    snapshot = { ...snapshot, external: { gsc } };
    const site = buildSiteFacts(snapshot, { ownerIntent: { aiCrawlers: project.aiCrawlerIntent } });
    const results = runRules(site, SITEMAP_RULES);
    const report = buildReport({
      results,
      versions: {
        crawlerVersion: snapshot.crawlerVersion,
        rulesetVersion: CODE_VERSIONS.rulesetVersion,
        weightsVersion: CODE_VERSIONS.weightsVersion,
        snapshotSetHash: "",
      },
      inputType: "url",
      rootUrl: snapshot.rootUrl,
      crawledAt: snapshot.crawledAt,
      pages: {
        crawled: snapshot.pages.length,
        indexable: site.pages.filter((p) => p.isIndexable).length,
        rendered: 0,
      },
    });
    const latestGsc = gsc
      ? await db.gscSnapshot.findUnique({ where: { id: gsc.snapshotId } })
      : null;
    const gscPages = new Set(
      ((latestGsc?.searchAnalytics ?? []) as { page: string }[]).map((r) => r.page),
    );
    const rows = sitemapUrlRows(site, { cms: project.cmsType, gscPages });
    const files = sitemapFiles(site);
    const summary = sitemapSummary(site, report, rows);

    // Carry over "added" ticks from the previous check while the URL is still missing.
    const previous = await db.sitemapCheck.findFirst({
      where: { projectId: project.id, status: "completed", id: { not: checkId } },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    const ticked = previous
      ? new Set(
          (
            await db.sitemapUrl.findMany({
              where: { checkId: previous.id, listType: "manual_add", added: true },
              select: { url: true },
            })
          ).map((u) => u.url),
        )
      : new Set<string>();

    await db.$transaction(
      async (tx) => {
        await tx.sitemapFile.deleteMany({ where: { checkId } });
        await tx.sitemapUrl.deleteMany({ where: { checkId } });
        if (files.length) {
          await tx.sitemapFile.createMany({
            data: files.map((f) => ({
              ...f,
              checkId,
              gscLastDownloaded: f.gscLastDownloaded ? new Date(f.gscLastDownloaded) : null,
            })) as Prisma.SitemapFileCreateManyInput[],
          });
        }
        if (rows.length) {
          await tx.sitemapUrl.createMany({
            data: rows.map((r) => ({
              ...r,
              checkId,
              added: r.listType === "manual_add" && ticked.has(r.url),
            })) as Prisma.SitemapUrlCreateManyInput[],
          });
        }
        await syncIssues(tx, {
          projectId: project.id,
          crawlId: checkId,
          report,
          now: deps.now(),
          source: "sitemap_api",
          ruleIds: SITEMAP_RULE_IDS,
        });
        await tx.sitemapCheck.update({
          where: { id: checkId },
          data: {
            status: "completed",
            completedAt: deps.now(),
            crawlerVersion: snapshot.crawlerVersion,
            rulesetVersion: CODE_VERSIONS.rulesetVersion,
            score: summary.score,
            sitemapsCount: summary.sitemapsCount,
            urlsInSitemaps: summary.urlsInSitemaps,
            issueCounts: summary.issueCounts,
            autoFixable: summary.autoFixable,
            manualUrls: summary.manualUrls,
            urlsToRemove: summary.urlsToRemove,
            gsc: (summary.gsc ?? undefined) as Prisma.InputJsonValue | undefined,
            results: report.rules as unknown as Prisma.InputJsonValue,
          },
        });
      },
      { timeout: 120_000 },
    );

    const completed = await db.sitemapCheck.findUniqueOrThrow({ where: { id: checkId } });
    return queueWebhookEvent(db, project.id, "sitemap.check.completed", checkSummary(completed));
  } catch (error) {
    await db.sitemapCheck.update({
      where: { id: checkId },
      data: {
        status: "failed",
        error: (error as Error).message.slice(0, 1000),
        completedAt: deps.now(),
      },
    });
    throw error;
  } finally {
    await source.cleanup();
  }
}

type CheckRow = Awaited<ReturnType<ScopedPrisma["sitemapCheck"]["findUniqueOrThrow"]>>;

/** The public summary shape (REQUIREMENTS M17 example response). */
export function checkSummary(check: CheckRow): Record<string, unknown> {
  return {
    checkId: check.id,
    status: check.status,
    score: check.score,
    versions: { ruleset: check.rulesetVersion, crawler: check.crawlerVersion },
    sitemaps: check.sitemapsCount,
    urlsInSitemaps: check.urlsInSitemaps,
    issues: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      ...(check.issueCounts as Record<string, number>),
    },
    autoFixable: check.autoFixable,
    manualUrls: check.manualUrls,
    urlsToRemove: check.urlsToRemove,
    gsc: check.gsc,
    createdAt: check.createdAt.toISOString(),
    completedAt: check.completedAt?.toISOString() ?? null,
    ...(check.error ? { error: check.error } : {}),
  };
}
