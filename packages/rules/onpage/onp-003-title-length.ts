import { defineRule, fail, forPages, indexable, pass } from "../src/define";

export const TITLE_MIN = 30;
export const TITLE_MAX = 60;

export const ONP_003 = defineRule(
  {
    id: "ONP-003",
    category: "onpage",
    severity: "low",
    title: "Title too short or too long",
    passCondition: `Passes when the title is ${TITLE_MIN}–${TITLE_MAX} characters long.`,
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "low",
    effort: 1,
    explanation: {
      why: "Short titles miss useful words; long titles get cut off in search results.",
      fix: [
        `Rewrite the title to ${TITLE_MIN}–${TITLE_MAX} characters, with the main topic first.`,
      ],
    },
  },
  (site) =>
    forPages(
      site,
      (p) => indexable(p) && Boolean(p.facts?.title),
      (p) => {
        const length = p.facts?.title?.length ?? 0;
        return length >= TITLE_MIN && length <= TITLE_MAX
          ? pass(p.url, { length })
          : fail(p.url, { length });
      },
    ),
);
