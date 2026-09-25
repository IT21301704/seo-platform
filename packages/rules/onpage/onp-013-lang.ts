import { defineRule, fail, forPages, indexable, pass } from "../src/define";
import { LANG_CODE } from "../src/helpers";

export const ONP_013 = defineRule(
  {
    id: "ONP-013",
    category: "onpage",
    severity: "medium",
    title: "Missing or invalid lang attribute",
    passCondition: 'Passes when <html lang="..."> is set to a valid language code (e.g. "en", "en-GB", "si").',
    appliesTo: "both",
    autoFixable: false,
    riskLevel: "low",
    effort: 1,
    explanation: {
      why: "The lang attribute tells search engines, translation tools and screen readers which language the page is in.",
      fix: ["Set the site language in your CMS settings, which fills in the lang attribute."],
    },
  },
  (site) =>
    forPages(site, indexable, (p) => {
      const lang = p.facts?.lang ?? null;
      return lang && LANG_CODE.test(lang) && lang !== "x-default" ? pass(p.url, { lang }) : fail(p.url, { lang });
    }),
);
