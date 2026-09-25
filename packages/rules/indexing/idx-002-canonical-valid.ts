import { defineRule, fail, forPages, pass } from "../src/define";

export const IDX_002 = defineRule(
  {
    id: "IDX-002",
    category: "indexing",
    severity: "high",
    title: "Canonical points to a broken, redirected or noindex URL",
    passCondition:
      "Passes when a page has one canonical tag, on the same site, pointing to a URL that returns 200 without redirecting, is crawlable and is not noindex.",
    appliesTo: "url",
    autoFixable: true,
    riskLevel: "high",
    effort: 1,
    explanation: {
      why: "Search engines ignore a canonical that points to a missing, redirected or blocked page, and may drop the page itself from results.",
      fix: [
        "Point the canonical at the page's own final URL (usually itself).",
        "Fix the setting in your SEO plugin rather than editing the HTML output.",
      ],
    },
  },
  (site) =>
    forPages(
      site,
      (p) => p.isHtml200 && !p.noindex && site.isAllowedForGooglebot(p.url) && p.facts?.canonical !== null,
      (p) => {
        const canonical = p.facts?.canonical ?? "";
        if ((p.facts?.canonicalCount ?? 0) > 1) return fail(p.url, { canonical, problem: "multiple canonical tags" });
        if (canonical === p.url) return pass(p.url, { canonical });
        if (new URL(canonical).origin !== site.origin) return fail(p.url, { canonical, problem: "other site" });
        if (!site.isAllowedForGooglebot(canonical)) return fail(p.url, { canonical, problem: "blocked by robots.txt" });
        const target = site.pageByUrl.get(canonical);
        if (!target) return pass(p.url, { canonical, note: "target not crawled" });
        if (target.record.chain.length > 0) return fail(p.url, { canonical, problem: "target redirects" });
        if (target.record.status !== 200) {
          return fail(p.url, { canonical, problem: `target returns ${target.record.status ?? "error"}` });
        }
        if (target.noindex) return fail(p.url, { canonical, problem: "target is noindex" });
        return pass(p.url, { canonical });
      },
    ),
);
