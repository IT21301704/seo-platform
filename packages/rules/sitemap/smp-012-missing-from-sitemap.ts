import { defineRule, fail, forPages, indexable, pass } from "../src/define";

export const SMP_012 = defineRule(
  {
    id: "SMP-012",
    category: "sitemap",
    scoreCategory: "indexing",
    severity: "high",
    title: "Indexable pages missing from the sitemap",
    passCondition: "Passes when every crawled indexable page is listed in a sitemap. Not applicable when there is no sitemap (see SMP-001).",
    appliesTo: "url",
    autoFixable: true,
    riskLevel: "high",
    effort: 1,
    explanation: {
      why: "Pages missing from the sitemap depend entirely on links to be found, so they are discovered and re-crawled more slowly.",
      fix: [
        "Include this content type in your SEO plugin's sitemap settings.",
        "For pages outside the CMS, add them to the manual URL list.",
      ],
    },
  },
  (site) => {
    if (site.sitemapEntries.size === 0) return [];
    return forPages(site, indexable, (p) => (site.sitemapEntries.has(p.url) ? pass(p.url) : fail(p.url)));
  },
);
