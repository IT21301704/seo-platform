import type { GscExternal } from "@seo/crawler";
import type { ScopedPrisma } from "@seo/db";

interface StoredSitemap {
  path: string;
  errors: number;
  warnings: number;
  isSitemapsIndex: boolean;
  lastDownloaded: string | null;
}

/**
 * The Search Console data an audit uses: the latest dated snapshot plus URL inspections made up
 * to that moment. Returns null without a connected GSC integration or snapshot.
 */
export async function gscExternalFor(
  db: ScopedPrisma,
  projectId: string,
): Promise<GscExternal | null> {
  const snapshot = await db.gscSnapshot.findFirst({
    where: { projectId },
    orderBy: { fetchedAt: "desc" },
  });
  if (!snapshot) return null;
  const inspections = await db.urlInspection.findMany({
    where: { projectId, inspectedAt: { lte: snapshot.fetchedAt } },
    orderBy: { url: "asc" },
    select: { url: true, verdict: true, coverageState: true, inspectedAt: true },
  });
  return {
    snapshotId: snapshot.id,
    siteUrl: snapshot.siteUrl,
    dataDate: snapshot.dataDate,
    fetchedAt: snapshot.fetchedAt.toISOString(),
    sitemaps: (snapshot.sitemaps as unknown as StoredSitemap[])
      .map((s) => ({
        path: s.path,
        errors: s.errors,
        warnings: s.warnings,
        isSitemapsIndex: s.isSitemapsIndex,
        lastDownloaded: s.lastDownloaded,
      }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    inspections: inspections.map((i) => ({
      url: i.url,
      verdict: i.verdict,
      coverageState: i.coverageState,
      inspectedAt: i.inspectedAt.toISOString(),
    })),
  };
}
