import { defineRule, fail, forPages, indexable, pass } from "../src/define";

const REQUIRED = ["og:title", "og:description", "og:image", "og:url", "og:type"] as const;

export const ONP_011 = defineRule(
  {
    id: "ONP-011",
    category: "onpage",
    severity: "low",
    title: "Missing Open Graph tags",
    passCondition: `Passes when the page has ${REQUIRED.join(", ")}.`,
    appliesTo: "both",
    autoFixable: false,
    riskLevel: "low",
    effort: 1,
    explanation: {
      why: "Open Graph tags control the title, text and image shown when the page is shared on social media and in chat apps.",
      fix: ["Enable social/Open Graph tags in your SEO plugin and set a default share image."],
    },
  },
  (site) =>
    forPages(site, indexable, (p) => {
      const missing = REQUIRED.filter((k) => !p.facts?.og[k]);
      return missing.length ? fail(p.url, { missing }) : pass(p.url);
    }),
);
