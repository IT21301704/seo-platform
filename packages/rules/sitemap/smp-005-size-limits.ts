import { defineRule, fail, pass } from "../src/define";

export const MAX_SITEMAP_URLS = 50_000;
export const MAX_SITEMAP_BYTES = 50 * 1024 * 1024;

export const SMP_005 = defineRule(
  {
    id: "SMP-005",
    category: "sitemap",
    scoreCategory: "technical",
    severity: "critical",
    title: "Sitemap exceeds 50,000 URLs or 50 MB",
    passCondition: "Passes when each sitemap file has at most 50,000 URLs and is at most 50 MB uncompressed.",
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "high",
    effort: 2,
    explanation: {
      why: "Search engines stop reading a sitemap beyond these limits, so the extra URLs are ignored.",
      fix: ["Split the sitemap into several files and list them in a sitemap index."],
    },
  },
  (site) =>
    site.sitemaps
      .filter((s) => s.record.status === 200 && s.record.body !== null)
      .map(({ record, parsed }) => {
        const urls = parsed?.entries.length ?? 0;
        const bytes = Buffer.byteLength(record.body ?? "", "utf8");
        const evidence = { urls, bytes };
        return urls > MAX_SITEMAP_URLS || bytes > MAX_SITEMAP_BYTES ? fail(record.url, evidence) : pass(record.url, evidence);
      }),
);
