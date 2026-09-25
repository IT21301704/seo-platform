import { defineRule, fail, pass } from "../src/define";

export const AI_005 = defineRule(
  {
    id: "AI-005",
    category: "ai",
    severity: "high",
    title: "Important pages block snippets (nosnippet)",
    passCondition: "Passes when no important page uses nosnippet or max-snippet:0 in meta robots or X-Robots-Tag.",
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "high",
    effort: 1,
    explanation: {
      why: "nosnippet stops Google from showing any text from the page in results, AI Overviews and AI Mode, so the page cannot be quoted as an answer.",
      fix: ["Remove nosnippet / max-snippet:0 from these pages.", "To hide one section only, use data-nosnippet on that element."],
    },
  },
  (site) =>
    site.importantUrls.flatMap((url) => {
      const page = site.pageByUrl.get(url);
      if (!page?.isHtml200 || !page.facts) return [];
      const blocking = page.facts.robotsDirectives.filter((d) => d === "nosnippet" || d === "max-snippet:0");
      return [blocking.length ? fail(url, { directives: blocking }) : pass(url)];
    }),
);
