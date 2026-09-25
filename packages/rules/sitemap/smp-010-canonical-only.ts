import { defineRule, fail, pass } from "../src/define";

export const SMP_010 = defineRule(
  {
    id: "SMP-010",
    category: "sitemap",
    scoreCategory: "indexing",
    severity: "medium",
    title: "Sitemap lists non-canonical URLs",
    passCondition: "Passes when no sitemap URL has a canonical tag pointing to a different URL.",
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "high",
    effort: 1,
    explanation: {
      why: "A page whose canonical points elsewhere tells search engines 'index the other URL', so listing it in the sitemap sends a mixed signal.",
      fix: ["List the canonical URL in the sitemap instead, or fix the page's canonical if it is wrong."],
    },
  },
  (site) =>
    [...site.sitemapEntries.keys()].flatMap((url) => {
      const page = site.pageByUrl.get(url);
      if (!page?.isHtml200 || !page.facts) return [];
      const canonical = page.facts.canonical;
      return canonical && canonical !== url ? [fail(url, { canonical })] : [pass(url)];
    }),
);
