import { defineRule, fail, forPages, html200, pass } from "../src/define";
import { LANG_CODE } from "../src/helpers";

export const IDX_006 = defineRule(
  {
    id: "IDX-006",
    category: "indexing",
    severity: "medium",
    title: "hreflang errors",
    passCondition:
      "Passes when every hreflang tag uses a valid language code and an absolute URL, the page lists itself, and each crawled alternate links back.",
    appliesTo: "both",
    autoFixable: false,
    riskLevel: "medium",
    effort: 3,
    explanation: {
      why: "hreflang tells search engines which language version to show each visitor. Errors make Google ignore the tags, so visitors may see the wrong language.",
      fix: [
        "Use ISO language codes (en, en-GB, si-LK) and full https:// URLs.",
        "Include a self-reference and make sure every alternate links back.",
      ],
    },
  },
  (site) =>
    forPages(site, html200, (p) => {
      const tags = p.facts?.hreflang ?? [];
      if (tags.length === 0) return null;
      const problems: string[] = [];
      for (const { lang, href } of tags) {
        if (!LANG_CODE.test(lang)) problems.push(`invalid code "${lang}"`);
        if (!/^https?:\/\//.test(href)) problems.push(`relative URL "${href}"`);
      }
      if (!tags.some((t) => t.href === p.url)) problems.push("no self-reference");
      for (const { href } of tags) {
        const target = site.pageByUrl.get(href);
        if (!target || href === p.url || !target.facts) continue;
        if (!target.facts.hreflang.some((t) => t.href === p.url)) problems.push(`no return link from ${href}`);
      }
      return problems.length ? fail(p.url, { problems }) : pass(p.url);
    }),
);
