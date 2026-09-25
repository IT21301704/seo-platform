import { defineRule, fail, forPages, pass } from "../src/define";

export const MAX_CLICK_DEPTH = 3;

export const LNK_004 = defineRule(
  {
    id: "LNK-004",
    category: "links",
    severity: "medium",
    title: "Pages more than 3 clicks from the home page",
    passCondition: `Passes when every indexable page can be reached from the home page in ${MAX_CLICK_DEPTH} clicks or fewer.`,
    appliesTo: "both",
    autoFixable: false,
    riskLevel: "low",
    effort: 3,
    explanation: {
      why: "Pages buried deep in the site get crawled less often and are treated as less important.",
      fix: [
        "Link to deep pages from category pages, menus or related-content blocks.",
        "Flatten long pagination or nested category chains.",
      ],
    },
  },
  (site) =>
    forPages(site, (p) => p.isIndexable && p.depth !== null, (p) =>
      (p.depth ?? 0) > MAX_CLICK_DEPTH ? fail(p.url, { depth: p.depth }) : pass(p.url, { depth: p.depth }),
    ),
);
