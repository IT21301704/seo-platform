import type { FixType } from "@seo/rules";
import type { Category, ScoredCategory, Severity } from "@seo/shared";

export const CATEGORY_LABEL: Record<Category, string> = {
  technical: "Technical",
  indexing: "Indexing",
  onpage: "On-page",
  performance: "Performance",
  links: "Internal links",
  schema: "Structured data",
  ai: "AI discoverability",
  sitemap: "Sitemap",
  a11y: "Accessibility",
  offpage: "Authority",
};

/** Dashboard order (wireframe 03: two columns). */
export const CATEGORY_ORDER: ScoredCategory[] = [
  "technical",
  "indexing",
  "onpage",
  "performance",
  "links",
  "schema",
  "ai",
];

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const FIX_LABEL: Record<FixType, string> = {
  "auto-low": "Auto-fix · low risk",
  "auto-approve": "Approve each",
  manual: "Manual list",
  guide: "Guide only",
};

export const STATUS_LABEL = {
  open: "Open",
  in_progress: "In progress",
  fixed: "Fixed",
  verified: "Verified",
  reopened: "Reopened",
  ignored: "Ignored",
} as const;

export const TAG_LABEL = {
  new: "New",
  still_open: "Still open",
  resolved: "Resolved",
  regressed: "Regressed",
} as const;

export const NO_GUARANTEE =
  "The SEO Health Score measures how well the site follows SEO best practices. It is not a ranking. Google and other search engines decide rankings, indexing and what appears in AI answers — we never guarantee them.";
