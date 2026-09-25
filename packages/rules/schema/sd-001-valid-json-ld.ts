import { nodeTypes } from "@seo/crawler";
import { defineRule, fail, forPages, indexable, pass } from "../src/define";

export const SD_001 = defineRule(
  {
    id: "SD-001",
    category: "schema",
    severity: "high",
    title: "Invalid JSON-LD structured data",
    passCondition:
      "Passes when every JSON-LD block parses as JSON and each item has a schema.org @context and an @type. Other schema checks are not applicable on a page that fails this one.",
    appliesTo: "both",
    autoFixable: false,
    riskLevel: "high",
    effort: 2,
    explanation: {
      why: "If structured data cannot be parsed, search engines ignore all of it, so the page loses rich results such as prices, ratings and FAQs.",
      fix: [
        "Test the page in Google's Rich Results Test to find the syntax error.",
        "Fix the template or plugin that outputs the JSON-LD, not the page HTML.",
      ],
    },
  },
  (site) =>
    forPages(site, indexable, (p) => {
      const blocks = p.facts?.jsonLd ?? [];
      if (blocks.length === 0) return null;
      const errors = blocks.filter((b) => !b.ok).map((b) => b.error ?? "invalid JSON");
      for (const node of blocks.flatMap((b) => b.nodes)) {
        const context = JSON.stringify(node["@context"] ?? "");
        if (!/schema\.org/i.test(context)) errors.push("missing schema.org @context");
        if (nodeTypes(node).length === 0) errors.push("missing @type");
      }
      return errors.length ? fail(p.url, { errors: [...new Set(errors)] }) : pass(p.url, { blocks: blocks.length });
    }),
);
