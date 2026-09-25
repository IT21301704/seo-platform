import type { ProgressSnapshot, Stage } from "@seo/worker/progress";

export interface AuditStatus {
  id: string;
  status: string;
  inputType: "url" | "code";
  pageLimit: number;
  pagesCrawled: number;
  pagesRendered: number;
  snapshotSetHash: string | null;
  healthScore: number | null;
  error: string | null;
  versions: { crawler: string; ruleset: string; weights: string; model: string; prompt: string };
  progress: ProgressSnapshot;
}

export const STAGE_INFO: { key: Stage; title: string; description: string; status: string }[] = [
  { key: "discover", title: "Discover", description: "robots.txt, sitemaps and URL queue in fixed order", status: "discovering" },
  { key: "crawl", title: "Crawl", description: "Status codes, redirects, canonicals, meta, headings, links, images", status: "crawling" },
  { key: "render", title: "Render", description: "Headless browser for pages that need JavaScript", status: "rendering" },
  { key: "performance", title: "Performance", description: "Real-user Core Web Vitals (CrUX) + median of 5 lab runs", status: "performance" },
  { key: "checks", title: "Run checks", description: "rule-based checks produce the score. No AI involved in scoring.", status: "checking" },
  { key: "explain", title: "Explain", description: "AI writes explanations and fix steps for failed checks only", status: "explaining" },
];

export const TERMINAL = new Set(["completed", "failed", "cancelled"]);
