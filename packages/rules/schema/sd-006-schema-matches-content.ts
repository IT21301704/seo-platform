import { defineRule, fail, forPages, indexable, pass } from "../src/define";
import { list, nodesOfType, normalizeText, obj, str } from "../src/helpers";

/** "4500.00" → "4500"; used to find the price among the page's digits. */
function priceDigits(price: string): string {
  return price
    .replace(/[^\d.]/g, "")
    .replace(/\.0+$/, "")
    .replace(".", "");
}

export const SD_006 = defineRule(
  {
    id: "SD-006",
    category: "schema",
    severity: "high",
    title: "Structured data does not match the visible content",
    passCondition:
      "Passes when FAQ questions and answers, product names and offer prices in the structured data also appear in the page's visible text.",
    appliesTo: "both",
    autoFixable: false,
    riskLevel: "high",
    confidence: 0.9,
    effort: 2,
    explanation: {
      why: "Google requires structured data to describe what visitors can see. Markup that differs from the page can lose rich results or trigger a manual action.",
      fix: [
        "Generate the markup from the same fields that render the page, so they cannot drift apart.",
        "Update the markup or the visible text so they say the same thing.",
      ],
    },
  },
  (site) =>
    forPages(site, indexable, (p) => {
      if (!p.facts) return null;
      const faqs = nodesOfType(p.facts, "FAQPage");
      const products = nodesOfType(p.facts, "Product");
      if (faqs === null || products === null || faqs.length + products.length === 0) return null;
      const body = normalizeText(p.facts.bodyText);
      const bodyDigits = p.facts.bodyText.replace(/[^\d]/g, "");
      const mismatches: string[] = [];
      for (const faq of faqs) {
        for (const q of list(faq["mainEntity"])) {
          const question = str(q["name"]);
          const answer = str(obj(q["acceptedAnswer"])?.["text"]);
          if (question && !body.includes(normalizeText(question)))
            mismatches.push(`question not on page: ${question}`);
          if (answer && !body.includes(normalizeText(answer.replace(/<[^>]+>/g, " ")))) {
            mismatches.push(`answer not on page: ${question ?? answer.slice(0, 40)}`);
          }
        }
      }
      for (const product of products) {
        const name = str(product["name"]);
        if (name && !body.includes(normalizeText(name)))
          mismatches.push(`product name not on page: ${name}`);
        for (const offer of list(product["offers"])) {
          const price = str(offer["price"]);
          if (price && !bodyDigits.includes(priceDigits(price)))
            mismatches.push(`price not on page: ${price}`);
        }
      }
      return mismatches.length ? fail(p.url, { mismatches }) : pass(p.url);
    }),
);
