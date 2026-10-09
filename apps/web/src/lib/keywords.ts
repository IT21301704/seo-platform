import "server-only";
import type { ScopedPrisma } from "@seo/db";
import {
  aggregate,
  brandWordsFor,
  cannibalization,
  contentGaps,
  fallbackClusters,
  ideasFor,
  quickWins,
} from "@seo/keywords";
import type { Cluster, KeywordStat, MapEntry, QueryRow } from "@seo/keywords";
import type { StoredClusters } from "@seo/worker/keywords";

/** Search Console country codes (ISO 3166-1 alpha-3, lower case) for the onboarding countries. */
export const COUNTRY_CODES: Record<string, { code: string; name: string }> = {
  LK: { code: "lka", name: "Sri Lanka" },
  IN: { code: "ind", name: "India" },
  GB: { code: "gbr", name: "United Kingdom" },
  US: { code: "usa", name: "United States" },
  AU: { code: "aus", name: "Australia" },
  SG: { code: "sgp", name: "Singapore" },
  AE: { code: "are", name: "United Arab Emirates" },
  CA: { code: "can", name: "Canada" },
};

export const LANGUAGES: Record<string, string> = { en: "English", si: "Sinhala", ta: "Tamil" };

export interface KeywordData {
  snapshot: { id: string; provider: string; startDate: string; endDate: string; fetchedAt: Date };
  stats: KeywordStat[];
  ideas: KeywordStat[];
  clusters: StoredClusters;
  map: (MapEntry & { id: string; source: string })[];
  quickWins: KeywordStat[];
  cannibal: ReturnType<typeof cannibalization>;
  gaps: ReturnType<typeof contentGaps>;
}

export async function loadKeywordData(
  db: ScopedPrisma,
  project: { id: string; rootUrl: string },
  filters: { seed: string; country: string | null },
): Promise<KeywordData | null> {
  const snapshot = await db.keywordSnapshot.findFirst({
    where: { projectId: project.id },
    orderBy: { fetchedAt: "desc" },
  });
  if (!snapshot) return null;
  const stats = aggregate(snapshot.rows as unknown as QueryRow[], {
    country: filters.country,
    brandWords: brandWordsFor(project.rootUrl),
  });
  const stored = (snapshot.clusters as unknown as StoredClusters | null) ?? {
    source: "words" as const,
    modelId: null,
    promptVersion: null,
    clusters: fallbackClusters(stats.map((s) => s.keyword)),
  };
  // Clusters only list queries present for the chosen country.
  const present = new Set(stats.map((s) => s.keyword));
  const clusters: Cluster[] = stored.clusters
    .map((c) => ({ ...c, keywords: c.keywords.filter((k) => present.has(k)) }))
    .filter((c) => c.keywords.length > 0);
  const map = (
    await db.keywordPageMap.findMany({
      where: { projectId: project.id },
      orderBy: [{ url: "asc" }, { role: "asc" }, { keyword: "asc" }],
    })
  ).map((m) => ({
    id: m.id,
    url: m.url,
    keyword: m.keyword,
    role: m.role as MapEntry["role"],
    source: m.source,
  }));
  return {
    snapshot: {
      id: snapshot.id,
      provider: snapshot.provider,
      startDate: snapshot.startDate,
      endDate: snapshot.endDate,
      fetchedAt: snapshot.fetchedAt,
    },
    stats,
    ideas: ideasFor(stats, filters.seed),
    clusters: { ...stored, clusters },
    map,
    quickWins: quickWins(stats),
    cannibal: cannibalization(stats),
    gaps: contentGaps(clusters, stats, map),
  };
}
