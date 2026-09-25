import { defineRule, fail, pass } from "../src/define";
import { LANG_CODE } from "../src/helpers";

export const SMP_015 = defineRule(
  {
    id: "SMP-015",
    category: "sitemap",
    scoreCategory: "indexing",
    severity: "medium",
    title: "Invalid hreflang alternates in the sitemap",
    passCondition:
      "Passes when every sitemap URL with xhtml:link alternates uses valid language codes, absolute URLs, and includes itself. Not applicable without alternates.",
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "high",
    effort: 2,
    explanation: {
      why: "Broken hreflang alternates in the sitemap are ignored, so search engines may show visitors the wrong language version.",
      fix: ["Regenerate the sitemap from your multilingual plugin; make sure each URL lists all language versions, including itself."],
    },
  },
  (site) =>
    [...site.sitemapEntries.values()]
      .filter((e) => e.alternates.length > 0)
      .map((e) => {
        const problems: string[] = [];
        for (const a of e.alternates) {
          if (!LANG_CODE.test(a.hreflang)) problems.push(`invalid code "${a.hreflang}"`);
          if (!/^https?:\/\//.test(a.href)) problems.push(`relative URL "${a.href}"`);
        }
        if (!e.alternates.some((a) => a.href === e.loc)) problems.push("does not list itself");
        return problems.length ? fail(e.loc, { problems }) : pass(e.loc);
      }),
);
