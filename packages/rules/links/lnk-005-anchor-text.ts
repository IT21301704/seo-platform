import { defineRule, fail, forPages, html200, pass } from "../src/define";

const GENERIC = new Set(["click here", "here", "read more", "more", "link", "this", "this page", "click"]);

export const LNK_005 = defineRule(
  {
    id: "LNK-005",
    category: "links",
    severity: "low",
    title: "Internal links with empty or generic anchor text",
    passCondition:
      'Passes when every internal link has descriptive text (or image alt text), not "click here", "read more" or nothing.',
    appliesTo: "both",
    autoFixable: false,
    riskLevel: "low",
    confidence: 0.8,
    effort: 1,
    explanation: {
      why: "Anchor text tells search engines and screen-reader users what the linked page is about. Generic or empty text wastes that signal.",
      fix: ['Rewrite the link text to describe the target, e.g. "mug care guide" instead of "read more".'],
    },
  },
  (site) =>
    forPages(site, html200, (p) => {
      const bad = (p.facts?.links ?? [])
        .filter((l) => l.url !== null && new URL(l.url).origin === site.origin)
        .filter((l) => l.text === "" || GENERIC.has(l.text.toLowerCase().replace(/[.!…→»]+$/, "").trim()))
        .map((l) => ({ href: l.href, text: l.text }));
      return bad.length ? fail(p.url, { links: bad }) : pass(p.url);
    }),
);
