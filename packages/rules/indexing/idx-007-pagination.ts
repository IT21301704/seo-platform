import { defineRule, fail, forPages, pass } from "../src/define";

const PAGE_PARAM = /[?&](page|p|pg)=(\d+)/i;
const PAGE_PATH = /\/page\/(\d+)\/?$/i;

function pageNumber(url: string): number | null {
  const m = PAGE_PARAM.exec(url) ?? PAGE_PATH.exec(url);
  const n = m ? Number(m[m.length - 1]) : NaN;
  return Number.isFinite(n) ? n : null;
}

export const IDX_007 = defineRule(
  {
    id: "IDX-007",
    category: "indexing",
    severity: "low",
    title: "Paginated pages canonicalise to page 1",
    passCondition:
      "Passes when page 2, 3, ... of a paginated list has a self-referencing canonical (not page 1).",
    appliesTo: "both",
    autoFixable: false,
    riskLevel: "medium",
    effort: 2,
    explanation: {
      why: "If every page of a list points its canonical at page 1, search engines may never index the products or posts that only appear on later pages.",
      fix: [
        "Give each paginated page a canonical to itself.",
        "Keep normal <a href> links between the pages.",
      ],
    },
  },
  (site) =>
    forPages(
      site,
      (p) => p.isHtml200 && (pageNumber(p.url) ?? 1) > 1,
      (p) => {
        const canonical = p.facts?.canonical ?? null;
        return canonical === null || canonical === p.url ? pass(p.url) : fail(p.url, { canonical });
      },
    ),
);
