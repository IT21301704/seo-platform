import { defineRule, fail, forPages, indexable, pass } from "../src/define";

export const ONP_012 = defineRule(
  {
    id: "ONP-012",
    category: "onpage",
    severity: "low",
    title: "Missing Twitter/X card tags",
    passCondition:
      "Passes when the page has twitter:card, plus a title and image (twitter:* or the Open Graph fallback).",
    appliesTo: "both",
    autoFixable: false,
    riskLevel: "low",
    effort: 1,
    explanation: {
      why: "Card tags make links shared on X/Twitter show a title and image instead of a bare URL.",
      fix: [
        'Add <meta name="twitter:card" content="summary_large_image"> through your SEO plugin\'s social settings.',
      ],
    },
  },
  (site) =>
    forPages(site, indexable, (p) => {
      const tw = p.facts?.twitter ?? {};
      const og = p.facts?.og ?? {};
      const missing = [
        tw["twitter:card"] ? null : "twitter:card",
        tw["twitter:title"] || og["og:title"] ? null : "twitter:title",
        tw["twitter:image"] || og["og:image"] ? null : "twitter:image",
      ].filter((m): m is string => m !== null);
      return missing.length ? fail(p.url, { missing }) : pass(p.url);
    }),
);
