import { defineRule, fail, pass } from "../src/define";

export const SMP_008 = defineRule(
  {
    id: "SMP-008",
    category: "sitemap",
    scoreCategory: "indexing",
    severity: "high",
    title: "Sitemap lists noindex pages",
    passCondition: "Passes when no sitemap URL has noindex in meta robots or X-Robots-Tag.",
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "high",
    effort: 1,
    explanation: {
      why: "Listing a page in the sitemap says 'index this', while noindex says the opposite. Mixed signals make the sitemap less trusted.",
      fix: ["Either remove noindex from the page, or exclude the page from the sitemap in your SEO plugin."],
    },
  },
  (site) =>
    [...site.sitemapEntries.keys()].flatMap((url) => {
      const page = site.pageByUrl.get(url);
      if (!page?.isHtml200) return [];
      return page.noindex ? [fail(url, { directives: page.facts?.robotsDirectives ?? [] })] : [pass(url)];
    }),
);
