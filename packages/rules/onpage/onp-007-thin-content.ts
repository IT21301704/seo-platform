import { defineRule, fail, forPages, indexable, pass } from "../src/define";

/** Flags near-empty pages; short listing pages (collections, blog index) are normal. */
export const MIN_WORDS = 50;

export const ONP_007 = defineRule(
  {
    id: "ONP-007",
    category: "onpage",
    severity: "medium",
    title: "Thin content",
    passCondition: `Passes when the page's main content has at least ${MIN_WORDS} words.`,
    appliesTo: "both",
    autoFixable: false,
    riskLevel: "low",
    confidence: 0.7,
    effort: 4,
    explanation: {
      why: "Pages with almost no text give search engines and AI assistants little to understand or quote, so they rarely rank.",
      fix: [
        "Add helpful, original text that answers what visitors want to know on this page.",
        "Merge or noindex pages that have no reason to exist on their own.",
      ],
    },
  },
  (site) =>
    forPages(site, indexable, (p) => {
      const words = p.facts?.wordCount ?? 0;
      return words >= MIN_WORDS ? pass(p.url, { words }) : fail(p.url, { words });
    }),
);
