// Keyword research jobs (REQUIREMENTS M18): dated Search Console query snapshots, clusters
// (Claude, or word-based without an API key), the automatic keyword-to-page map and the keyword
// issues KWD-001 / KWD-002 (source "keywords", not part of the Health Score).
import type { Prisma, ScopedPrisma } from "@seo/db";
import type { GscApi } from "@seo/integrations";
import {
  KEYWORD_CHECKS,
  aggregate,
  autoMap,
  brandWordsFor,
  cannibalization,
  fallbackClusters,
  primaryKeywordGaps,
} from "@seo/keywords";
import type { Cluster, KeywordStat, QueryRow } from "@seo/keywords";
import { clusterKeywords } from "@seo/llm";
import type { LlmClient } from "@seo/llm";
import type { JsonValue } from "@seo/shared";
import { syncIssues } from "./issues";
import type { SyncReport } from "./issues";
import { DbLlmCache } from "./llm-cache";

export interface StoredClusters {
  source: "ai" | "words";
  modelId: string | null;
  promptVersion: string | null;
  clusters: Cluster[];
}

/** Saves a dated query × page × country snapshot (called by the daily Google sync). */
export async function saveKeywordSnapshot(
  db: ScopedPrisma,
  args: {
    projectId: string;
    provider: "google" | "demo";
    siteUrl: string;
    range: { startDate: string; endDate: string };
    api: GscApi;
    now: Date;
  },
): Promise<string> {
  const rows = (await args.api.queryAnalytics(args.siteUrl, args.range)).sort(
    (a, b) =>
      a.query.localeCompare(b.query) ||
      a.page.localeCompare(b.page) ||
      a.country.localeCompare(b.country),
  );
  const snapshot = await db.keywordSnapshot.create({
    data: {
      projectId: args.projectId,
      provider: args.provider,
      siteUrl: args.siteUrl,
      startDate: args.range.startDate,
      endDate: args.range.endDate,
      fetchedAt: args.now,
      rows: rows as unknown as Prisma.InputJsonValue,
    } as Prisma.KeywordSnapshotUncheckedCreateInput,
  });
  return snapshot.id;
}

export const MAX_CLUSTERED_KEYWORDS = 400;

/** Claude clusters (cached) with every leftover query placed by the word-based fallback. */
async function clustersFor(
  stats: KeywordStat[],
  llm: LlmClient | null,
  db: ScopedPrisma,
): Promise<StoredClusters> {
  const keywords = stats.slice(0, MAX_CLUSTERED_KEYWORDS).map((s) => s.keyword);
  const ai = await clusterKeywords(keywords, { llm, cache: new DbLlmCache(db) });
  if (!ai)
    return {
      source: "words",
      modelId: null,
      promptVersion: null,
      clusters: fallbackClusters(keywords),
    };
  const known = new Set(keywords);
  const seen = new Set<string>();
  const clusters = ai.output.clusters
    .map((c) => ({
      name: c.name,
      keywords: c.keywords.filter((k) => known.has(k) && !seen.has(k) && seen.add(k)),
    }))
    .filter((c) => c.keywords.length > 0);
  const leftovers = keywords.filter((k) => !seen.has(k));
  return {
    source: "ai",
    modelId: ai.modelId,
    promptVersion: ai.promptVersion,
    clusters: [...clusters, ...fallbackClusters(leftovers)],
  };
}

/** Refreshes automatic map entries; the owner's own entries are never changed. */
async function refreshAutoMap(
  db: ScopedPrisma,
  projectId: string,
  organizationId: string,
  stats: KeywordStat[],
): Promise<void> {
  const userEntries = await db.keywordPageMap.findMany({ where: { projectId, source: "user" } });
  const userPages = new Set(userEntries.map((e) => e.url));
  const userKeywords = new Set(userEntries.map((e) => e.keyword));
  const entries = autoMap(stats).filter(
    (e) => !userPages.has(e.url) && !userKeywords.has(e.keyword),
  );
  await db.$transaction(async (tx) => {
    await tx.keywordPageMap.deleteMany({ where: { projectId, source: "auto" } });
    if (entries.length) {
      await tx.keywordPageMap.createMany({
        data: entries.map((e) => ({ organizationId, projectId, ...e, source: "auto" })),
        skipDuplicates: true,
      });
    }
  });
}

const PRIORITY = { "KWD-001": 1, "KWD-002": 3 } as const;

function check(
  id: "KWD-001" | "KWD-002",
  outcomes: SyncReport["rules"][number]["outcomes"],
): SyncReport["rules"][number] {
  const c = KEYWORD_CHECKS[id];
  return {
    ruleId: id,
    title: c.title,
    category: "onpage",
    severity: c.severity,
    priority: { priority: PRIORITY[id] },
    outcomes,
  };
}

/** KWD-001 (primary keyword missing) and KWD-002 (cannibalization), one item per page. */
export async function keywordIssues(
  db: ScopedPrisma,
  projectId: string,
  rootUrl: string,
  stats: KeywordStat[],
): Promise<SyncReport> {
  // KWD-002: every competing page except the strongest one gets an item listing its queries.
  const perPage = new Map<string, { keywords: string[]; competesWith: Set<string> }>();
  for (const c of cannibalization(stats)) {
    const [target, ...others] = c.pages;
    for (const page of others) {
      const entry = perPage.get(page.url) ?? { keywords: [], competesWith: new Set<string>() };
      entry.keywords.push(c.keyword);
      if (target) entry.competesWith.add(target.url);
      perPage.set(page.url, entry);
    }
  }
  const kwd2 = [...perPage]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([url, e]) => ({
      url,
      result: "fail",
      evidence: { keywords: e.keywords.sort(), competesWith: [...e.competesWith].sort() } as Record<
        string,
        JsonValue
      >,
    }));

  // KWD-001: the primary keyword of each mapped page in the latest audit's title, H1, description.
  const crawl = await db.crawl.findFirst({
    where: { projectId, status: "completed" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  const primaries = await db.keywordPageMap.findMany({
    where: { projectId, role: "primary" },
    orderBy: { url: "asc" },
  });
  const pages = crawl
    ? await db.page.findMany({
        where: { crawlId: crawl.id, url: { in: primaries.map((p) => p.url) } },
        include: { facts: { where: { key: { in: ["title", "metaDescription", "h1"] } } } },
      })
    : [];
  const kwd1 = primaries.flatMap((p) => {
    const page = pages.find((x) => x.url === p.url);
    if (!page?.isIndexable) return [];
    const fact = (key: string) => page.facts.find((f) => f.key === key)?.value;
    const missing = primaryKeywordGaps(p.keyword, {
      title: String(fact("title") ?? "") || null,
      metaDescription: String(fact("metaDescription") ?? "") || null,
      h1: (fact("h1") as string[] | undefined) ?? [],
    });
    return [
      {
        url: p.url,
        result: missing.length ? "fail" : "pass",
        evidence: { keyword: p.keyword, missingFrom: missing } as Record<string, JsonValue>,
      },
    ];
  });
  return { rootUrl, rules: [check("KWD-001", kwd1), check("KWD-002", kwd2)] };
}

/** Clusters + map + keyword issues for the latest snapshot. */
export async function refreshKeywords(
  projectId: string,
  deps: { db: ScopedPrisma; llm: LlmClient | null; now: () => Date },
): Promise<{ snapshotId: string | null; clusters: number; issues: number }> {
  const { db } = deps;
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const snapshot = await db.keywordSnapshot.findFirst({
    where: { projectId },
    orderBy: { fetchedAt: "desc" },
  });
  if (!snapshot) return { snapshotId: null, clusters: 0, issues: 0 };
  const stats = aggregate(snapshot.rows as unknown as QueryRow[], {
    brandWords: brandWordsFor(project.rootUrl),
  });

  let stored = snapshot.clusters as unknown as StoredClusters | null;
  if (!stored) {
    stored = await clustersFor(stats, deps.llm, db);
    await db.keywordSnapshot.update({
      where: { id: snapshot.id },
      data: { clusters: stored as unknown as Prisma.InputJsonValue },
    });
  }
  await refreshAutoMap(db, projectId, project.organizationId, stats);
  const report = await keywordIssues(db, projectId, project.rootUrl, stats);
  await db.$transaction(
    (tx) =>
      syncIssues(tx, {
        projectId,
        crawlId: snapshot.id,
        report,
        now: deps.now(),
        source: "keywords",
        ruleIds: new Set(["KWD-001", "KWD-002"]),
      }),
    { timeout: 60_000 },
  );
  return {
    snapshotId: snapshot.id,
    clusters: stored.clusters.length,
    issues: report.rules.reduce(
      (n, r) => n + r.outcomes.filter((o) => o.result === "fail").length,
      0,
    ),
  };
}
