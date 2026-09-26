// Daily Google sync (REQUIREMENTS M9): Search Console, URL Inspection, GA4 and CrUX, saved as
// dated snapshots. URL Inspection never exceeds 2,000 calls per site per day or 600 per minute.
import type { Prisma, ScopedPrisma } from "@seo/db";
import {
  HttpError,
  RateLimiter,
  URL_INSPECTION_DAILY_LIMIT,
  URL_INSPECTION_PER_MINUTE,
  ga4Range,
  gscRange,
  planInspections,
  queryCruxOrigin,
  quotaDay,
} from "@seo/integrations";
import type { JsonHttp } from "@seo/integrations";
import { ga4ApiFor, gscApiFor } from "./google";

export interface GoogleSyncDeps {
  db: ScopedPrisma;
  http: JsonHttp;
  now: () => Date;
  limiter?: RateLimiter;
}

export interface GoogleSyncResult {
  gscSnapshotId: string | null;
  ga4SnapshotId: string | null;
  inspected: number;
  quotaUsed: number;
  quotaRemaining: number;
  errors: string[];
}

export const inspectionCounterKey = (projectId: string): string => `url_inspection:${projectId}`;

/** How many URL inspections are left today for this project's property. */
export async function inspectionQuota(
  db: ScopedPrisma,
  projectId: string,
  now: Date,
): Promise<{ used: number; remaining: number; day: string }> {
  const day = quotaDay(now);
  const counter = await db.usageCounter.findFirst({
    where: { key: inspectionCounterKey(projectId), day },
  });
  const used = counter?.count ?? 0;
  return { used, remaining: Math.max(0, URL_INSPECTION_DAILY_LIMIT - used), day };
}

async function countInspection(
  db: ScopedPrisma,
  organizationId: string,
  projectId: string,
  day: string,
): Promise<void> {
  const key = inspectionCounterKey(projectId);
  await db.usageCounter.upsert({
    where: { organizationId_key_day: { organizationId, key, day } },
    create: { key, day, count: 1 } as Prisma.UsageCounterUncheckedCreateInput,
    update: { count: { increment: 1 } },
  });
}

export async function syncGoogle(
  projectId: string,
  deps: GoogleSyncDeps,
): Promise<GoogleSyncResult> {
  const { db, http } = deps;
  const now = deps.now();
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const integrations = await db.integration.findMany({ where: { projectId, status: "connected" } });
  const result: GoogleSyncResult = {
    gscSnapshotId: null,
    ga4SnapshotId: null,
    inspected: 0,
    quotaUsed: 0,
    quotaRemaining: 0,
    errors: [],
  };

  const gsc = integrations.find((i) => i.type === "gsc" && i.externalId);
  if (gsc?.externalId) {
    try {
      const api = gscApiFor(db, http, gsc, project.rootUrl, deps.now);
      const range = gscRange(now);
      const [rows, sitemaps] = await Promise.all([
        api.searchAnalytics(gsc.externalId, range),
        api.listSitemaps(gsc.externalId),
      ]);
      const clicksByUrl = new Map(rows.map((r) => [r.page, r.clicks]));
      const snapshot = await db.gscSnapshot.create({
        data: {
          projectId,
          provider: gsc.provider,
          siteUrl: gsc.externalId,
          dataDate: range.endDate,
          fetchedAt: now,
          searchAnalytics: rows as unknown as Prisma.InputJsonValue,
          sitemaps: sitemaps as unknown as Prisma.InputJsonValue,
        } as Prisma.GscSnapshotUncheckedCreateInput,
      });
      result.gscSnapshotId = snapshot.id;

      // URL Inspection: today's batch within the remaining daily quota.
      const quota = await inspectionQuota(db, projectId, now);
      const candidates = await inspectionCandidates(db, projectId, clicksByUrl);
      const plan = planInspections(candidates, quota.remaining, now);
      const limiter = deps.limiter ?? new RateLimiter(URL_INSPECTION_PER_MINUTE);
      for (const url of plan) {
        await limiter.wait();
        try {
          const i = await api.inspect(gsc.externalId, url);
          await countInspection(db, project.organizationId, projectId, quota.day);
          const data = {
            inspectedAt: new Date(),
            verdict: i.verdict,
            coverageState: i.coverageState,
            indexingState: i.indexingState,
            robotsTxtState: i.robotsTxtState,
            lastCrawlTime: i.lastCrawlTime ? new Date(i.lastCrawlTime) : null,
            googleCanonical: i.googleCanonical,
            raw: i.raw as Prisma.InputJsonValue,
          };
          await db.urlInspection.upsert({
            where: { projectId_url: { projectId, url } },
            create: { projectId, url, ...data } as Prisma.UrlInspectionUncheckedCreateInput,
            update: data,
          });
          result.inspected += 1;
        } catch (error) {
          if (error instanceof HttpError && error.status === 429) {
            result.errors.push("URL Inspection quota reached for today");
            break;
          }
          result.errors.push(
            `Inspection failed for ${url}: ${(error as Error).message.slice(0, 200)}`,
          );
        }
      }
      const after = await inspectionQuota(db, projectId, now);
      result.quotaUsed = after.used;
      result.quotaRemaining = after.remaining;
      await db.integration.update({
        where: { id: gsc.id },
        data: { lastSyncAt: now, error: null },
      });
    } catch (error) {
      result.errors.push(`Search Console: ${(error as Error).message}`);
      await db.integration.update({
        where: { id: gsc.id },
        data: { error: (error as Error).message.slice(0, 500) },
      });
    }
  }

  const ga4 = integrations.find((i) => i.type === "ga4" && i.externalId);
  if (ga4?.externalId) {
    try {
      const range = ga4Range(now);
      const rows = await ga4ApiFor(db, http, ga4, deps.now).sessionsByPage(ga4.externalId, range);
      const snapshot = await db.ga4Snapshot.create({
        data: {
          projectId,
          provider: ga4.provider,
          propertyId: ga4.externalId,
          ...range,
          fetchedAt: now,
          rows: rows as unknown as Prisma.InputJsonValue,
        } as Prisma.Ga4SnapshotUncheckedCreateInput,
      });
      result.ga4SnapshotId = snapshot.id;
      await db.integration.update({
        where: { id: ga4.id },
        data: { lastSyncAt: now, error: null },
      });
    } catch (error) {
      result.errors.push(`GA4: ${(error as Error).message}`);
      await db.integration.update({
        where: { id: ga4.id },
        data: { error: (error as Error).message.slice(0, 500) },
      });
    }
  }

  const psiKey = process.env["PSI_API_KEY"];
  if (psiKey && !integrations.some((i) => i.provider === "demo")) {
    try {
      const origin = new URL(project.rootUrl).origin;
      const metrics = await queryCruxOrigin(http, psiKey, origin);
      if (metrics) {
        await db.cruxSnapshot.create({
          data: {
            projectId,
            origin,
            fetchedAt: now,
            metrics: metrics as unknown as Prisma.InputJsonValue,
          } as Prisma.CruxSnapshotUncheckedCreateInput,
        });
      }
    } catch (error) {
      result.errors.push(`CrUX: ${(error as Error).message}`);
    }
  }
  return result;
}

/** URLs worth inspecting: sitemap URLs and indexable pages of the latest crawl, with traffic. */
async function inspectionCandidates(
  db: ScopedPrisma,
  projectId: string,
  clicksByUrl: Map<string, number>,
) {
  const crawl = await db.crawl.findFirst({
    where: { projectId, status: "completed" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!crawl) return [];
  const [pages, inspections, ga4] = await Promise.all([
    db.page.findMany({
      where: { crawlId: crawl.id, OR: [{ isIndexable: true }, { discoveredVia: "sitemap" }] },
      select: { url: true },
    }),
    db.urlInspection.findMany({ where: { projectId }, select: { url: true, inspectedAt: true } }),
    db.ga4Snapshot.findFirst({ where: { projectId }, orderBy: { fetchedAt: "desc" } }),
  ]);
  const inspectedAt = new Map(inspections.map((i) => [i.url, i.inspectedAt]));
  const sessions = new Map(
    ((ga4?.rows ?? []) as { path: string; sessions: number }[]).map((r) => [r.path, r.sessions]),
  );
  return pages.map((p) => ({
    url: p.url,
    traffic: (clicksByUrl.get(p.url) ?? 0) * 10 + (sessions.get(new URL(p.url).pathname) ?? 0),
    lastInspectedAt: inspectedAt.get(p.url) ?? null,
  }));
}
