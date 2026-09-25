import { defineRule, fail, pass } from "../src/define";

export const IDX_004 = defineRule(
  {
    id: "IDX-004",
    category: "indexing",
    severity: "medium",
    title: "Orphan pages (in the sitemap but not linked)",
    passCondition: "Passes when every indexable page listed in a sitemap has at least one internal link pointing to it.",
    appliesTo: "url",
    autoFixable: false,
    riskLevel: "low",
    confidence: 0.9,
    effort: 2,
    explanation: {
      why: "Pages without internal links are hard for search engines to discover and value, and visitors cannot reach them from your navigation.",
      fix: [
        "Link to the page from a relevant category, menu or related-content section.",
        "If the page is no longer needed, remove it from the sitemap and redirect it.",
      ],
    },
  },
  (site) =>
    [...site.sitemapEntries.keys()].flatMap((url) => {
      const page = site.pageByUrl.get(url);
      if (!page?.isIndexable || url === site.rootUrl) return [];
      return page.inboundFrom.length === 0 ? [fail(url)] : [pass(url, { inboundLinks: page.inboundFrom.length })];
    }),
);
