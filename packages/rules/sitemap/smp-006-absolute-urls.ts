import { defineRule, fail, pass } from "../src/define";

export const SMP_006 = defineRule(
  {
    id: "SMP-006",
    category: "sitemap",
    scoreCategory: "technical",
    severity: "high",
    title: "Sitemap URLs are relative, on another host or not HTTPS",
    passCondition: "Passes when every <loc> is an absolute https:// URL on the site's own host.",
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "high",
    effort: 1,
    explanation: {
      why: "Search engines ignore sitemap URLs that are relative or belong to another host, and http:// URLs point at the insecure duplicate.",
      fix: ["Set the site address to https:// in your CMS and regenerate the sitemap."],
    },
  },
  (site) => {
    const outcomes = [];
    const seen = new Set<string>();
    for (const { parsed } of site.sitemaps) {
      for (const entry of parsed?.entries ?? []) {
        if (seen.has(entry.loc)) continue;
        seen.add(entry.loc);
        let url: URL | null = null;
        try {
          url = new URL(entry.loc);
        } catch {
          url = null;
        }
        if (!url) outcomes.push(fail(entry.loc, { problem: "not an absolute URL" }));
        else if (url.protocol !== "https:") outcomes.push(fail(entry.loc, { problem: "not https" }));
        else if (url.origin !== site.origin) outcomes.push(fail(entry.loc, { problem: "other host" }));
        else outcomes.push(pass(entry.loc));
      }
    }
    return outcomes;
  },
);
