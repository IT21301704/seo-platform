import { defineRule, fail, pass } from "../src/define";

export const SMP_001 = defineRule(
  {
    id: "SMP-001",
    category: "sitemap",
    scoreCategory: "technical",
    severity: "critical",
    title: "No XML sitemap found",
    passCondition:
      "Passes when at least one sitemap is found (robots.txt, /sitemap.xml, /sitemap_index.xml, /wp-sitemap.xml) and every sitemap listed in robots.txt or a sitemap index returns 200.",
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "high",
    effort: 1,
    explanation: {
      why: "A sitemap lists the pages you want search engines to find. Without one, new or poorly linked pages are discovered slowly or not at all.",
      fix: [
        "Turn on the XML sitemap in your SEO plugin or framework (WordPress has one at /wp-sitemap.xml).",
        "Fix any sitemap URL in robots.txt that returns an error.",
      ],
    },
  },
  (site) => {
    const ok = site.sitemaps.filter((s) => s.record.status === 200);
    const failing = site.sitemaps.filter((s) => s.record.status !== 200);
    if (site.sitemaps.length === 0) return [fail(null, { problem: "No sitemap found" })];
    if (failing.length) {
      return [
        fail(null, {
          failing: failing.map((s) => ({ url: s.record.url, status: s.record.status })),
        }),
      ];
    }
    return [pass(null, { sitemaps: ok.map((s) => s.record.url) })];
  },
);
