import { defineRule, fail, pass } from "../src/define";

export const SMP_009 = defineRule(
  {
    id: "SMP-009",
    category: "sitemap",
    scoreCategory: "indexing",
    severity: "high",
    title: "Sitemap lists URLs blocked by robots.txt",
    passCondition: "Passes when robots.txt allows Googlebot to crawl every same-site sitemap URL.",
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "high",
    effort: 1,
    explanation: {
      why: "Google cannot crawl URLs that robots.txt blocks, so listing them in the sitemap is a contradiction and they will not be indexed properly.",
      fix: ["Allow these URLs in robots.txt, or remove them from the sitemap."],
    },
  },
  (site) =>
    [...site.sitemapEntries.keys()]
      .filter((url) => url.startsWith(`${site.origin}/`))
      .map((url) =>
        site.isAllowedForGooglebot(url) ? pass(url) : fail(url, { blockedFor: "Googlebot" }),
      ),
);
