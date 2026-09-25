import { defineRule, fail, pass } from "../src/define";

export const IDX_003 = defineRule(
  {
    id: "IDX-003",
    category: "indexing",
    severity: "critical",
    title: "Important pages set to noindex",
    passCondition:
      "Passes when no important page (home, main navigation pages and pages their main content links to) has noindex in meta robots or X-Robots-Tag.",
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "high",
    effort: 1,
    explanation: {
      why: "noindex tells search engines to drop the page from results. On an important page this removes it from Google entirely.",
      fix: [
        "Remove noindex from these pages in your SEO plugin (e.g. 'Allow search engines to show this page').",
        "Check that a theme update or staging setting did not add it site-wide.",
      ],
    },
  },
  (site) =>
    site.importantUrls.flatMap((url) => {
      const page = site.pageByUrl.get(url);
      if (!page?.isHtml200 || !page.facts) return [];
      return page.noindex ? [fail(url, { directives: page.facts.robotsDirectives })] : [pass(url)];
    }),
);
