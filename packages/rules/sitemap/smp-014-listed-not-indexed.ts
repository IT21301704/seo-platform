import { defineRule, fail, pass } from "../src/define";

const indexed = (verdict: string, coverage: string): boolean =>
  verdict === "PASS" || /^submitted and indexed$|^indexed/i.test(coverage);

export const SMP_014 = defineRule(
  {
    id: "SMP-014",
    category: "sitemap",
    scoreCategory: "indexing",
    severity: "medium",
    title: "Sitemap URLs that Google has not indexed",
    passCondition:
      "Passes for each inspected sitemap URL that URL Inspection reports as indexed. URLs not inspected yet are skipped (quota: 2,000 per site per day); never extrapolated.",
    appliesTo: "url",
    autoFixable: false,
    riskLevel: "low",
    confidence: 0.7,
    effort: 3,
    explanation: {
      why: "Google chooses what to index. 'Crawled – currently not indexed' or 'Discovered – currently not indexed' usually points to thin, duplicate or poorly linked pages. We report it for review; there is no API to force indexing.",
      fix: [
        "Improve the page's content and internal links, or remove it from the sitemap if it should not be indexed.",
        "Use Search Console's URL Inspection to request indexing for important pages. Indexing is not guaranteed.",
      ],
    },
  },
  (site) =>
    [...site.sitemapEntries.keys()].flatMap((url) => {
      const i = site.gscInspections.get(url);
      if (!i) return [];
      const evidence = {
        coverageState: i.coverageState,
        verdict: i.verdict,
        inspectedAt: i.inspectedAt,
      };
      return [indexed(i.verdict, i.coverageState) ? pass(url, evidence) : fail(url, evidence)];
    }),
);
