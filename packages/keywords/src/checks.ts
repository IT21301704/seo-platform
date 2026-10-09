// Keyword issues written to the issue manager with source "keywords". They depend on the
// owner's keyword map, so they are not part of the Health Score (docs/decisions.md).

export interface KeywordCheck {
  id: "KWD-001" | "KWD-002";
  title: string;
  severity: "high" | "medium" | "low";
  passCondition: string;
  why: string;
  fix: string[];
}

export const KEYWORD_CHECKS: Record<KeywordCheck["id"], KeywordCheck> = {
  "KWD-001": {
    id: "KWD-001",
    title: "Primary keyword missing from title, H1 or description",
    severity: "low",
    passCondition:
      "Passes when the page's primary keyword (from the keyword map) appears in its title, H1 and meta description. No keyword density is measured.",
    why: "Searchers and search engines look at the title, main heading and description to decide whether a page answers their query.",
    fix: [
      "Work the primary keyword into the title, H1 and description where it reads naturally.",
      "If it does not fit, choose a different primary keyword for the page in the keyword map.",
    ],
  },
  "KWD-002": {
    id: "KWD-002",
    title: "Keyword cannibalization: pages compete for the same query",
    severity: "medium",
    passCondition:
      "Passes when no more than one page gets at least 10% of the Search Console impressions (and 10+ impressions) for the same query.",
    why: "When several of your pages compete for one query, search engines may switch between them and none of them ranks as well as one focused page would.",
    fix: [
      "Choose one page as the target for the query and set it as primary in the keyword map.",
      "Link from the other pages to the target page and adjust their titles to their own topics.",
      "Merge pages with the same purpose and redirect the old one.",
    ],
  },
};
