import { defineRule, fail, pass } from "../src/define";

export const SMP_007 = defineRule(
  {
    id: "SMP-007",
    category: "sitemap",
    scoreCategory: "indexing",
    severity: "high",
    title: "Sitemap lists redirected or broken URLs",
    passCondition:
      "Passes when every sitemap URL we fetched returns 200 directly (no redirect, no 4xx/5xx).",
    appliesTo: "url",
    autoFixable: true,
    riskLevel: "high",
    effort: 1,
    explanation: {
      why: "Sitemaps should only list final, working URLs. Redirects and errors waste crawl budget and make search engines trust the sitemap less.",
      fix: [
        "Remove broken URLs from the sitemap, or replace redirected ones with their final URL, through your CMS settings.",
      ],
    },
  },
  (site) =>
    [...site.sitemapEntries.keys()].flatMap((url) => {
      const page = site.pageByUrl.get(url);
      if (!page) return [];
      const { status, chain } = page.record;
      if (chain.length > 0)
        return [
          fail(url, {
            problem: "redirects",
            to: page.record.finalUrl,
            status: chain[0]?.status ?? null,
          }),
        ];
      if (status !== 200) return [fail(url, { problem: "error", status })];
      return [pass(url)];
    }),
);
