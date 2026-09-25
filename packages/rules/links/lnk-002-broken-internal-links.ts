import { defineRule, fail, forPages, html200, pass } from "../src/define";
import { knownStatus } from "../src/helpers";

export const LNK_002 = defineRule(
  {
    id: "LNK-002",
    category: "links",
    severity: "high",
    title: "Broken internal links",
    passCondition: "Passes when every internal link on the page leads to a URL that returns a status below 400.",
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "low",
    effort: 1,
    explanation: {
      why: "Broken links send visitors and search engines to error pages, waste crawl time and lose the value the link would pass on.",
      fix: [
        "Update each link to the page's current URL, or remove it.",
        "If the page moved, also add a 301 redirect from the old URL.",
      ],
    },
  },
  (site) =>
    forPages(site, html200, (p) => {
      const broken = [
        ...new Set(
          (p.facts?.links ?? [])
            .map((l) => l.url)
            .filter((u): u is string => u !== null && new URL(u).origin === site.origin)
            .filter((u) => (knownStatus(site, u) ?? 0) >= 400),
        ),
      ].sort();
      return broken.length
        ? fail(p.url, { brokenLinks: broken.map((u) => ({ url: u, status: knownStatus(site, u) })) })
        : pass(p.url);
    }),
);
