import { defineRule, fail, forPages, indexable, pass } from "../src/define";
import { duplicates } from "../src/helpers";

export const ONP_002 = defineRule(
  {
    id: "ONP-002",
    category: "onpage",
    severity: "medium",
    title: "Duplicate page titles",
    passCondition: "Passes when no two indexable pages share the same title.",
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "low",
    effort: 1,
    explanation: {
      why: "When pages share a title, search engines struggle to tell them apart and searchers cannot see which result is which.",
      fix: ["Give each page a title that names what is unique about it (product, service, topic)."],
    },
  },
  (site) => {
    const pages = site.pages.filter((p) => p.isIndexable && p.facts?.title);
    const dupes = duplicates(pages, (p) => p.facts?.title?.toLowerCase() ?? null);
    const sharedWith = new Map<string, string[]>();
    for (const group of dupes.values()) {
      for (const p of group)
        sharedWith.set(
          p.url,
          group.filter((o) => o !== p).map((o) => o.url),
        );
    }
    return forPages(
      site,
      (p) => indexable(p) && Boolean(p.facts?.title),
      (p) => {
        const others = sharedWith.get(p.url);
        return others
          ? fail(p.url, { title: p.facts?.title ?? null, sameTitleAs: others })
          : pass(p.url);
      },
    );
  },
);
