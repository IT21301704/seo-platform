import { defineRule, fail, forPages, indexable, pass } from "../src/define";
import { list, nodesOfType, str } from "../src/helpers";
import type { JsonLdNode } from "@seo/crawler";

function productProblems(product: JsonLdNode): string[] {
  const problems: string[] = [];
  if (!str(product["name"])) problems.push("name");
  if (!product["image"]) problems.push("image");
  const offers = list(product["offers"]);
  if (offers.length === 0) return [...problems, "offers"];
  for (const offer of offers) {
    if (!str(offer["price"]) && !str(offer["lowPrice"])) problems.push("offers.price");
    if (!str(offer["priceCurrency"])) problems.push("offers.priceCurrency");
    if (!str(offer["availability"]) && !str(offer["offerCount"]))
      problems.push("offers.availability");
  }
  return [...new Set(problems)];
}

export const SD_004 = defineRule(
  {
    id: "SD-004",
    category: "schema",
    severity: "high",
    title: 'Product schema missing "offers" or required fields',
    passCondition:
      "Passes when every Product item has name, image and offers with price, priceCurrency and availability.",
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "high",
    effort: 2,
    explanation: {
      why: "Without offers, Google cannot show price and stock in search results, and the product is not eligible for merchant listings.",
      fix: [
        "Make sure your e-commerce plugin outputs the price, currency and stock status in the Product markup.",
        "Check the product in Google's Rich Results Test.",
      ],
    },
  },
  (site) =>
    forPages(site, indexable, (p) => {
      const products = p.facts ? nodesOfType(p.facts, "Product") : null;
      if (!products?.length) return null;
      const missing = [...new Set(products.flatMap(productProblems))].sort();
      return missing.length ? fail(p.url, { missing }) : pass(p.url);
    }),
);
