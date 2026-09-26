import { defineRule, fail, forPages, indexable, pass } from "../src/define";

export const ONP_001 = defineRule(
  {
    id: "ONP-001",
    category: "onpage",
    severity: "high",
    title: "Missing page title",
    passCondition: "Passes when every indexable page has a non-empty <title>.",
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "low",
    effort: 1,
    explanation: {
      why: "The title is the clickable headline in search results and a key clue to what the page is about. Without one, search engines make one up.",
      fix: [
        "Write a unique title of 30–60 characters that describes the page.",
        "Set it in your CMS or SEO plugin title field.",
      ],
    },
  },
  (site) => forPages(site, indexable, (p) => (p.facts?.title ? pass(p.url) : fail(p.url))),
);
