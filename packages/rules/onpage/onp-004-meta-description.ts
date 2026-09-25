import { defineRule, fail, forPages, indexable, pass } from "../src/define";
import { duplicates } from "../src/helpers";

export const DESCRIPTION_MIN = 70;
export const DESCRIPTION_MAX = 160;

export const ONP_004 = defineRule(
  {
    id: "ONP-004",
    category: "onpage",
    severity: "high",
    title: "Missing meta description",
    passCondition: `Passes when <meta name="description"> exists, is ${DESCRIPTION_MIN}–${DESCRIPTION_MAX} characters and is unique across the site.`,
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "low",
    effort: 1,
    explanation: {
      why: "Search engines and AI assistants often use the meta description as the summary of a page. Without one, they guess from page text, which can be less clear and lower click-through.",
      fix: [
        `Write a unique ${DESCRIPTION_MIN}–${DESCRIPTION_MAX} character summary per page.`,
        "Add it in your SEO plugin (Yoast / Rank Math) field.",
        "Re-run the check to verify.",
      ],
    },
  },
  (site) => {
    const pages = site.pages.filter((p) => p.isIndexable && p.facts?.metaDescription);
    const dupes = duplicates(pages, (p) => p.facts?.metaDescription?.toLowerCase() ?? null);
    const shared = new Map<string, string[]>();
    for (const group of dupes.values()) {
      for (const p of group) shared.set(p.url, group.filter((o) => o !== p).map((o) => o.url));
    }
    return forPages(site, indexable, (p) => {
      const description = p.facts?.metaDescription ?? "";
      if (description === "") return fail(p.url, { problem: "missing" });
      const length = description.length;
      if (length < DESCRIPTION_MIN) return fail(p.url, { problem: "too short", length });
      if (length > DESCRIPTION_MAX) return fail(p.url, { problem: "too long", length });
      const others = shared.get(p.url);
      if (others) return fail(p.url, { problem: "duplicate", sameAs: others });
      return pass(p.url, { length });
    });
  },
);

export type DescriptionCheck = "pass" | "missing" | "too short" | "too long" | "duplicate";

/**
 * Rule-engine re-check for a proposed description (used before any AI draft can be approved).
 * `others` are the descriptions of the site's other pages.
 */
export function recheckDescription(description: string, others: readonly string[]): DescriptionCheck {
  const text = description.trim();
  if (text === "") return "missing";
  if (text.length < DESCRIPTION_MIN) return "too short";
  if (text.length > DESCRIPTION_MAX) return "too long";
  if (others.some((o) => o.trim().toLowerCase() === text.toLowerCase())) return "duplicate";
  return "pass";
}
