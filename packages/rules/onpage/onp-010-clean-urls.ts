import { defineRule, fail, forPages, indexable, pass } from "../src/define";

export const MAX_URL_LENGTH = 115;

export function urlProblems(url: string): string[] {
  const u = new URL(url);
  const problems: string[] = [];
  if (/[A-Z]/.test(u.pathname)) problems.push("uppercase letters");
  if (u.pathname.includes("_")) problems.push("underscores instead of hyphens");
  if (/%20|\s/.test(u.pathname)) problems.push("spaces");
  if (u.search !== "") problems.push("query parameters");
  if (url.length > MAX_URL_LENGTH) problems.push(`longer than ${MAX_URL_LENGTH} characters`);
  return problems;
}

export const ONP_010 = defineRule(
  {
    id: "ONP-010",
    category: "onpage",
    severity: "low",
    title: "URLs are not clean",
    passCondition: `Passes when indexable URLs are lowercase, use hyphens, have no spaces or query parameters, and are at most ${MAX_URL_LENGTH} characters.`,
    appliesTo: "both",
    autoFixable: false,
    riskLevel: "high",
    confidence: 0.8,
    effort: 3,
    explanation: {
      why: "Short, readable URLs are easier to share and understand, and avoid duplicate versions caused by case or parameters.",
      fix: [
        "Use lowercase words separated by hyphens in your CMS permalink settings.",
        "If you change existing URLs, add 301 redirects from the old ones.",
      ],
    },
  },
  (site) =>
    forPages(site, indexable, (p) => {
      const problems = urlProblems(p.url);
      return problems.length ? fail(p.url, { problems }) : pass(p.url);
    }),
);
