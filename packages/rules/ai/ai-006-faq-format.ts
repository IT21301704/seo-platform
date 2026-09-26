import { defineRule, fail, forPages, indexable, pass } from "../src/define";
import { nodesOfType } from "../src/helpers";

const MIN_QUESTIONS = 2;

export const AI_006 = defineRule(
  {
    id: "AI-006",
    category: "ai",
    severity: "low",
    title: "FAQ page is not in question-and-answer format",
    passCondition: `Passes when a FAQ page (URL contains /faq or has FAQPage markup) shows at least ${MIN_QUESTIONS} questions as headings ending in "?".`,
    appliesTo: "both",
    autoFixable: false,
    riskLevel: "low",
    confidence: 0.8,
    effort: 2,
    explanation: {
      why: "AI assistants extract answers most reliably when each question is a heading followed directly by its answer.",
      fix: [
        "Write each question as an H2 or H3 ending in '?', with the answer in the paragraph right after it.",
      ],
    },
  },
  (site) =>
    forPages(
      site,
      (p) =>
        indexable(p) &&
        (/\/faqs?\b/i.test(new URL(p.url).pathname) ||
          (p.facts ? (nodesOfType(p.facts, "FAQPage")?.length ?? 0) > 0 : false)),
      (p) => {
        const questions = (p.facts?.headings ?? []).filter(
          (h) => h.level >= 2 && h.text.trim().endsWith("?"),
        );
        return questions.length >= MIN_QUESTIONS
          ? pass(p.url, { questions: questions.length })
          : fail(p.url, { questions: questions.length });
      },
    ),
);
