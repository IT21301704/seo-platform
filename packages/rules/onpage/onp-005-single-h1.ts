import { defineRule, fail, forPages, indexable, pass } from "../src/define";

export const ONP_005 = defineRule(
  {
    id: "ONP-005",
    category: "onpage",
    severity: "medium",
    title: "Page does not have exactly one H1",
    passCondition: "Passes when the page has exactly one <h1> heading.",
    appliesTo: "both",
    autoFixable: false,
    riskLevel: "low",
    effort: 1,
    explanation: {
      why: "The H1 is the page's main heading. None leaves the topic unclear; several make it ambiguous for search engines and screen readers.",
      fix: [
        "Keep one H1 that states the page topic.",
        "Turn other H1s into H2 or H3 sub-headings.",
      ],
    },
  },
  (site) =>
    forPages(site, indexable, (p) => {
      const count = p.facts?.h1.length ?? 0;
      return count === 1 ? pass(p.url) : fail(p.url, { count, h1: p.facts?.h1 ?? [] });
    }),
);
