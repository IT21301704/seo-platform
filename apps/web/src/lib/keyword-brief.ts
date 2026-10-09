import "server-only";
import type { ScopedPrisma } from "@seo/db";
import type { ContentGap } from "@seo/keywords";
import type { BriefInput } from "@seo/llm";
import { hostOf } from "./utils";
import type { KeywordData } from "./keywords";
import { latestCompletedCrawl } from "./queries";

/**
 * The exact input of a content-gap brief. Built the same way when drafting and when reading the
 * cached brief, so both hit the same cache key (ruleId + content hash + prompt version + model).
 */
export async function briefInput(
  db: ScopedPrisma,
  project: { id: string; rootUrl: string },
  data: KeywordData,
  gap: ContentGap,
): Promise<BriefInput> {
  const urls = [
    ...new Set(
      gap.keywords.flatMap(
        (k) => data.stats.find((s) => s.keyword === k)?.pages.map((p) => p.url) ?? [],
      ),
    ),
  ].slice(0, 6);
  const latest = await latestCompletedCrawl(db, project.id);
  const pages = latest
    ? await db.page.findMany({
        where: { crawlId: latest.crawl.id, url: { in: urls } },
        include: { facts: { where: { key: "title" } } },
        orderBy: { url: "asc" },
      })
    : [];
  return {
    site: hostOf(project.rootUrl),
    cluster: gap.name,
    keywords: [...gap.keywords].sort(),
    relatedPages: urls.sort().map((url) => ({
      url,
      title: String(pages.find((p) => p.url === url)?.facts[0]?.value ?? "") || null,
    })),
  };
}
