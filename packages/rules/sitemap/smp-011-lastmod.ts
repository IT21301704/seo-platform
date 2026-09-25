import { isW3cDate } from "@seo/crawler";
import { defineRule, fail, pass } from "../src/define";

export const SMP_011 = defineRule(
  {
    id: "SMP-011",
    category: "sitemap",
    scoreCategory: "indexing",
    severity: "medium",
    title: "Invalid or future lastmod dates",
    passCondition:
      "Passes when every <lastmod> is a valid W3C date and not after the crawl date. Entries without lastmod are skipped (it is optional).",
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "high",
    effort: 1,
    explanation: {
      why: "Google uses lastmod to decide what to re-crawl, but only if it is accurate. Invalid or future dates make Google ignore it.",
      fix: ["Let your CMS fill lastmod from each page's real 'last modified' date instead of a fixed or current date."],
    },
  },
  (site) => {
    const crawlDate = site.crawledAt.slice(0, 10);
    return [...site.sitemapEntries.values()]
      .filter((e) => e.lastmod !== null)
      .map((e) => {
        const lastmod = e.lastmod ?? "";
        if (!isW3cDate(lastmod)) return fail(e.loc, { lastmod, problem: "not a W3C date" });
        if (lastmod.slice(0, 10) > crawlDate) return fail(e.loc, { lastmod, problem: "in the future", crawlDate });
        return pass(e.loc, { lastmod });
      });
  },
);
