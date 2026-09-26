import { defineRule, fail, pass } from "../src/define";

export const TEC_005 = defineRule(
  {
    id: "TEC-005",
    category: "technical",
    severity: "high",
    title: "Redirect loops",
    passCondition:
      "Passes when no redirect leads back to a URL already in its chain (and no chain exceeds 10 hops).",
    appliesTo: "url",
    autoFixable: true,
    riskLevel: "high",
    effort: 2,
    explanation: {
      why: "A redirect loop never reaches a page, so neither visitors nor search engines can load it.",
      fix: [
        "Find the redirect rules for these URLs and remove the one that points back.",
        "Re-test the URL in a browser.",
      ],
    },
  },
  (site) =>
    site.pages
      .filter((p) => p.record.chain.length > 0 || p.record.loop)
      .map(({ url, record }) => {
        const tooMany = record.error?.includes("more than") ?? false;
        return record.loop || tooMany
          ? fail(url, { chain: record.chain.map((h) => h.url), error: record.error })
          : pass(url);
      }),
);
