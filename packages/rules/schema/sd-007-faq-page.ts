import { defineRule, fail, forPages, indexable, pass } from "../src/define";
import { list, nodesOfType, obj, str } from "../src/helpers";

export const SD_007 = defineRule(
  {
    id: "SD-007",
    category: "schema",
    severity: "medium",
    title: "FAQPage structured data is incomplete",
    passCondition:
      "Passes when every FAQPage has at least one Question, each with a name and an acceptedAnswer text.",
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "high",
    effort: 1,
    explanation: {
      why: "Incomplete FAQ markup is ignored, so AI assistants and search engines cannot pick up your answers as easily.",
      fix: [
        "Give each Question a name (the question) and an acceptedAnswer with the full answer text.",
      ],
    },
  },
  (site) =>
    forPages(site, indexable, (p) => {
      const faqs = p.facts ? nodesOfType(p.facts, "FAQPage") : null;
      if (!faqs?.length) return null;
      const problems: string[] = [];
      for (const faq of faqs) {
        const questions = list(faq["mainEntity"]);
        if (questions.length === 0) problems.push("no questions");
        questions.forEach((q, i) => {
          if (!str(q["name"])) problems.push(`question ${i + 1}: missing name`);
          if (!str(obj(q["acceptedAnswer"])?.["text"]))
            problems.push(`question ${i + 1}: missing answer text`);
        });
      }
      return problems.length ? fail(p.url, { problems }) : pass(p.url);
    }),
);
