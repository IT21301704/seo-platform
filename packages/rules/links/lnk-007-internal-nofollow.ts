import { defineRule, fail, forPages, html200, pass } from "../src/define";

export const LNK_007 = defineRule(
  {
    id: "LNK-007",
    category: "links",
    severity: "low",
    title: "Internal links marked nofollow",
    passCondition: 'Passes when no internal link has rel="nofollow".',
    appliesTo: "both",
    autoFixable: false,
    riskLevel: "low",
    effort: 1,
    explanation: {
      why: "nofollow on your own links tells search engines not to pass value to your own pages, which can weaken them.",
      fix: ['Remove rel="nofollow" from links to your own pages.'],
    },
  },
  (site) =>
    forPages(site, html200, (p) => {
      const nofollow = (p.facts?.links ?? [])
        .filter((l) => l.url !== null && new URL(l.url).origin === site.origin && l.rel.includes("nofollow"))
        .map((l) => l.href);
      return nofollow.length ? fail(p.url, { hrefs: [...new Set(nofollow)].sort() }) : pass(p.url);
    }),
);
