import { defineRule, fail, forPages, html200, pass } from "../src/define";

/** Statuses that clearly mean "gone". 401/403/405/429 are inconclusive (bot blocking). */
const isBroken = (status: number | null): boolean =>
  status === 404 || status === 410 || (status ?? 0) >= 500;

export const LNK_003 = defineRule(
  {
    id: "LNK-003",
    category: "links",
    severity: "medium",
    title: "Broken external links",
    passCondition: "Passes when no checked external link returns 404, 410 or a 5xx error.",
    appliesTo: "url",
    autoFixable: false,
    riskLevel: "low",
    confidence: 0.9,
    effort: 1,
    explanation: {
      why: "Links to missing pages on other sites frustrate visitors and make your content look out of date.",
      fix: ["Replace the link with a working source, or remove it."],
    },
  },
  (site) =>
    forPages(site, html200, (p) => {
      const checked = [
        ...new Set((p.facts?.links ?? []).map((l) => l.url).filter((u): u is string => u !== null)),
      ]
        .map((u) => site.externalLinks.get(u))
        .filter((r) => r !== undefined);
      if (checked.length === 0) return null;
      const broken = checked
        .filter((r) => isBroken(r.status))
        .map((r) => ({ url: r.url, status: r.status }));
      return broken.length
        ? fail(p.url, { brokenLinks: broken })
        : pass(p.url, { checked: checked.length });
    }),
);
