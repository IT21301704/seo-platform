import { defineRule, fail, forPages, indexable, pass } from "../src/define";

export const ONP_014 = defineRule(
  {
    id: "ONP-014",
    category: "onpage",
    severity: "high",
    title: "Missing mobile viewport",
    passCondition: 'Passes when <meta name="viewport"> includes width=device-width.',
    appliesTo: "both",
    autoFixable: false,
    riskLevel: "low",
    effort: 1,
    explanation: {
      why: "Google indexes the mobile version of pages. Without a viewport tag, phones show a zoomed-out desktop layout.",
      fix: ['Add <meta name="viewport" content="width=device-width, initial-scale=1"> in the theme header.'],
    },
  },
  (site) =>
    forPages(site, indexable, (p) =>
      /width\s*=\s*device-width/i.test(p.facts?.viewport ?? "")
        ? pass(p.url)
        : fail(p.url, { viewport: p.facts?.viewport ?? null }),
    ),
);
