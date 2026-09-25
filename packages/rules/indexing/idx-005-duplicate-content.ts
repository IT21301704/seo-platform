import { defineRule, fail, forPages, indexable, pass } from "../src/define";
import { duplicates, normalizeText } from "../src/helpers";

export const IDX_005 = defineRule(
  {
    id: "IDX-005",
    category: "indexing",
    severity: "medium",
    title: "Duplicate content across pages",
    passCondition: "Passes when no two indexable pages have identical main content.",
    appliesTo: "both",
    autoFixable: false,
    riskLevel: "medium",
    confidence: 0.8,
    effort: 3,
    explanation: {
      why: "When pages repeat the same content, search engines pick one to show and ignore the others, often not the one you want.",
      fix: [
        "Make each page's content unique, or merge the pages.",
        "If duplicates must exist, point their canonical tag to the main version.",
      ],
    },
  },
  (site) => {
    const pages = site.pages.filter((p) => p.isIndexable && p.facts);
    const dupes = duplicates(pages, (p) => normalizeText(p.facts?.mainText ?? "") || null);
    const duplicateOf = new Map<string, string[]>();
    for (const group of dupes.values()) {
      for (const p of group) duplicateOf.set(p.url, group.filter((o) => o !== p).map((o) => o.url));
    }
    return forPages(site, indexable, (p) => {
      const others = duplicateOf.get(p.url);
      return others ? fail(p.url, { sameContentAs: others }) : pass(p.url);
    });
  },
);
