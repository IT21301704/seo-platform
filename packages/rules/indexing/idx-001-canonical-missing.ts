import { defineRule, fail, forPages, pass } from "../src/define";

export const IDX_001 = defineRule(
  {
    id: "IDX-001",
    category: "indexing",
    severity: "medium",
    title: "Canonical tag is missing",
    passCondition: 'Passes when every indexable page has a <link rel="canonical"> tag.',
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "high",
    effort: 1,
    explanation: {
      why: "A canonical tag tells search engines which URL is the main version of a page, so URL variants (tracking parameters, trailing slashes) do not compete as duplicates.",
      fix: [
        "Add a self-referencing canonical tag with the page's full https:// URL.",
        "Turn on canonical tags in your SEO plugin or theme so every page gets one.",
      ],
    },
  },
  (site) =>
    forPages(
      site,
      (p) => p.isHtml200 && !p.noindex && site.isAllowedForGooglebot(p.url),
      (p) => (p.facts?.canonical ? pass(p.url) : fail(p.url)),
    ),
);
