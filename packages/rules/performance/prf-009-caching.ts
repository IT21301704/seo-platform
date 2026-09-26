import { defineRule, fail, forPages, indexable, pass } from "../src/define";

export const PRF_009 = defineRule(
  {
    id: "PRF-009",
    category: "performance",
    severity: "low",
    title: "No caching headers",
    passCondition:
      "Passes when the page response has Cache-Control (not no-store), ETag or Last-Modified.",
    appliesTo: "url",
    autoFixable: false,
    riskLevel: "low",
    effort: 1,
    explanation: {
      why: "Caching headers let browsers and CDNs reuse responses, making repeat visits faster and reducing server load.",
      fix: [
        "Enable page caching in your host or caching plugin, or set Cache-Control at your CDN.",
      ],
    },
  },
  (site) =>
    forPages(site, indexable, (p) => {
      const h = p.record.headers;
      const cacheControl = h["cache-control"] ?? "";
      const ok =
        (cacheControl !== "" && !/no-store/i.test(cacheControl)) ||
        Boolean(h["etag"]) ||
        Boolean(h["last-modified"]);
      return ok ? pass(p.url) : fail(p.url, { cacheControl: cacheControl || null });
    }),
);
