import { defineRule, fail, pass } from "../src/define";

export const SMP_002 = defineRule(
  {
    id: "SMP-002",
    category: "sitemap",
    scoreCategory: "technical",
    severity: "high",
    title: "Sitemap is not listed in robots.txt",
    passCondition: "Passes when robots.txt has at least one Sitemap: line.",
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "high",
    effort: 1,
    explanation: {
      why: "The Sitemap: line in robots.txt lets every search engine and AI crawler find your sitemap, not only the ones you submitted it to.",
      fix: ["Add 'Sitemap: https://your-domain/sitemap.xml' to robots.txt (most SEO plugins can do this for you)."],
    },
  },
  (site) =>
    site.robots.parsed.sitemaps.length > 0
      ? [pass(null, { sitemaps: site.robots.parsed.sitemaps })]
      : [fail(null, { robotsStatus: site.robots.status })],
);
