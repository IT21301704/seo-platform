import "server-only";
import { extractPageFacts } from "@seo/crawler";
import type { ScopedPrisma } from "@seo/db";
import { draftDescriptions, llmClientFromEnv } from "@seo/llm";
import type { PageExcerpt } from "@seo/llm";
import { recheckDescription } from "@seo/rules";
import type { DescriptionCheck } from "@seo/rules";
import { DbLlmCache } from "@seo/worker/llm-cache";
import { S3BlobStore, gunzip } from "@seo/worker/storage";
import { latestCompletedCrawl } from "./queries";

/** Rules with an AI draft preview in Phase 1 (read-only screen 07). */
export const PREVIEWABLE = new Set(["ONP-004"]);
export const MAX_PREVIEW_PAGES = 24;

export interface PreviewRow {
  url: string;
  current: string;
  suggestion: string | null;
  check: DescriptionCheck | null;
}

export interface PreviewData {
  crawlId: string;
  rows: PreviewRow[];
  llmConfigured: boolean;
  generated: boolean;
  modelId: string | null;
}

/** Loads the failing ONP-004 pages of the latest audit, their current values and any cached drafts. */
export async function loadDescriptionPreview(
  db: ScopedPrisma,
  projectId: string,
  generate: boolean,
): Promise<PreviewData | null> {
  const latest = await latestCompletedCrawl(db, projectId);
  const rule = latest?.report.rules.find((r) => r.ruleId === "ONP-004");
  if (!latest || !rule) return null;
  const urls = rule.outcomes
    .filter((o) => o.result === "fail" && o.url)
    .map((o) => o.url as string)
    .slice(0, MAX_PREVIEW_PAGES);

  const pages = await db.page.findMany({
    where: { crawlId: latest.crawl.id },
    include: { facts: { where: { key: "metaDescription" } } },
  });
  const currentByUrl = new Map(pages.map((p) => [p.url, String(p.facts[0]?.value ?? "")]));

  // Page excerpts (title, headings, first 2,000 words) come from the stored HTML snapshots.
  const blobs = S3BlobStore.fromEnv();
  const excerpts: PageExcerpt[] = [];
  for (const url of urls) {
    const page = pages.find((p) => p.url === url);
    const html = page?.snapshotPath ? await blobs.get(page.snapshotPath) : null;
    const facts = html ? extractPageFacts(gunzip(html), url) : null;
    excerpts.push({
      url,
      title: facts?.title ?? null,
      headings: facts?.headings.slice(0, 20).map((h) => h.text) ?? [],
      text: facts?.mainText.split(" ").slice(0, 2000).join(" ") ?? "",
    });
  }

  const llm = llmClientFromEnv();
  const drafts = await draftDescriptions(excerpts, {
    llm,
    cache: new DbLlmCache(db),
    cachedOnly: !generate,
  });
  const suggestionByUrl = new Map(drafts?.output.drafts.map((d) => [d.url, d.description]) ?? []);

  const rows = urls.map((url) => {
    const suggestion = suggestionByUrl.get(url) ?? null;
    // The rule engine, not the LLM, decides whether a draft is acceptable.
    const others = [
      ...[...currentByUrl].filter(([u, d]) => u !== url && d !== "").map(([, d]) => d),
      ...[...suggestionByUrl].filter(([u]) => u !== url).map(([, d]) => d),
    ];
    return {
      url,
      current: currentByUrl.get(url) ?? "",
      suggestion,
      check: suggestion === null ? null : recheckDescription(suggestion, others),
    };
  });
  return {
    crawlId: latest.crawl.id,
    rows,
    llmConfigured: llm !== null,
    generated: drafts !== null,
    modelId: drafts?.modelId ?? llm?.modelId ?? null,
  };
}
