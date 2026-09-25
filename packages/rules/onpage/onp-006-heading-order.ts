import { defineRule, fail, forPages, indexable, pass } from "../src/define";

export const ONP_006 = defineRule(
  {
    id: "ONP-006",
    category: "onpage",
    severity: "low",
    title: "Heading levels are skipped",
    passCondition: "Passes when headings never jump more than one level deeper (e.g. H2 → H4).",
    appliesTo: "both",
    autoFixable: false,
    riskLevel: "low",
    effort: 1,
    explanation: {
      why: "A logical heading outline helps search engines and screen readers understand how the page's sections relate.",
      fix: ["Use H2 for sections and H3 for sub-sections, without skipping levels.", "Style headings with CSS instead of picking a level for its size."],
    },
  },
  (site) =>
    forPages(site, indexable, (p) => {
      const headings = p.facts?.headings ?? [];
      if (headings.length === 0) return null;
      let previous = 1;
      for (const h of headings) {
        if (h.level > previous + 1) return fail(p.url, { skippedFrom: previous, to: h.level, heading: h.text });
        previous = h.level;
      }
      return pass(p.url);
    }),
);
