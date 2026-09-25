import { defineRule, fail, forPages, indexable, pass } from "../src/define";

export const MAX_HTML_BYTES = 500 * 1024;

export const PRF_004 = defineRule(
  {
    id: "PRF-004",
    category: "performance",
    severity: "medium",
    title: "HTML document is too large",
    passCondition: `Passes when the page's HTML is at most ${MAX_HTML_BYTES / 1024} KB (uncompressed).`,
    appliesTo: "both",
    autoFixable: false,
    riskLevel: "low",
    effort: 3,
    explanation: {
      why: "Very large HTML takes longer to download and parse, especially on mobile, and often means inline data or duplicated markup.",
      fix: ["Remove inline images (base64), large inline scripts/styles and unused markup.", "Paginate very long lists."],
    },
  },
  (site) =>
    forPages(site, indexable, (p) => {
      const bytes = p.record.bodySize;
      return bytes <= MAX_HTML_BYTES ? pass(p.url, { bytes }) : fail(p.url, { bytes });
    }),
);
