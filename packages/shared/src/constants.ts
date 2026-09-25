import type { Severity } from "./types";

/** Severity weights used by the scoring formula (REQUIREMENTS M5). */
export const SEVERITY_WEIGHTS: Readonly<Record<Severity, number>> = {
  critical: 10,
  high: 5,
  medium: 2,
  low: 1,
};

/** Categories that make up the SEO Health Score. */
export const SCORED_CATEGORIES = [
  "technical",
  "indexing",
  "onpage",
  "performance",
  "links",
  "schema",
  "ai",
] as const;
export type ScoredCategory = (typeof SCORED_CATEGORIES)[number];

/** Categories that exist but are NOT part of the Health Score. */
export const UNSCORED_CATEGORIES = ["sitemap", "a11y", "offpage"] as const;
export type UnscoredCategory = (typeof UNSCORED_CATEGORIES)[number];

export type Category = ScoredCategory | UnscoredCategory;

/** Category weights in percent, WEIGHTS_VERSION "v1" (REQUIREMENTS M6). Must sum to 100. */
export const CATEGORY_WEIGHTS_V1: Readonly<Record<ScoredCategory, number>> = {
  technical: 20,
  indexing: 15,
  onpage: 20,
  performance: 15,
  links: 10,
  schema: 10,
  ai: 10,
};

/** Rule ID prefix per category, e.g. ONP-004. */
export const RULE_ID_PREFIX: Readonly<Record<Category, string>> = {
  technical: "TEC",
  indexing: "IDX",
  onpage: "ONP",
  performance: "PRF",
  links: "LNK",
  schema: "SD",
  ai: "AI",
  sitemap: "SMP",
  a11y: "A11Y",
  offpage: "OFF",
};

export const RULE_ID_PATTERN = /^(TEC|IDX|ONP|PRF|LNK|SD|AI|SMP|A11Y|OFF|KWD)-\d{3}$/;

export function isRuleId(value: string): boolean {
  return RULE_ID_PATTERN.test(value);
}

/** Crawler identity and politeness limits (REQUIREMENTS M2). */
export const CRAWLER_USER_AGENT = "SEOPlatformBot/1.0 (+https://[domain]/bot)";
export const CRAWL_REQUESTS_PER_SECOND = 2;
export const MAX_PAGE_SIZE_BYTES = 5 * 1024 * 1024;
