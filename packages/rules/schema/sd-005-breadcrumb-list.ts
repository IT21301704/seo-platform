import { defineRule, fail, forPages, indexable, pass } from "../src/define";
import { list, nodesOfType, obj, str } from "../src/helpers";

export const SD_005 = defineRule(
  {
    id: "SD-005",
    category: "schema",
    severity: "low",
    title: "BreadcrumbList structured data is invalid",
    passCondition:
      "Passes when every BreadcrumbList has items numbered 1, 2, 3 … with a name, and every item except the last has an absolute URL.",
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "high",
    effort: 1,
    explanation: {
      why: "Valid breadcrumb markup lets Google show your site structure in results instead of a raw URL.",
      fix: [
        "Use your SEO plugin's breadcrumb feature so the markup matches the visible breadcrumbs.",
      ],
    },
  },
  (site) =>
    forPages(site, indexable, (p) => {
      const lists = p.facts ? nodesOfType(p.facts, "BreadcrumbList") : null;
      if (!lists?.length) return null;
      const problems: string[] = [];
      for (const bl of lists) {
        const items = list(bl["itemListElement"]);
        if (items.length === 0) problems.push("no itemListElement");
        items.forEach((item, i) => {
          if (Number(item["position"]) !== i + 1)
            problems.push(`item ${i + 1}: position should be ${i + 1}`);
          const target = obj(item["item"]);
          const name = str(item["name"]) ?? (target ? str(target["name"]) : null);
          if (!name) problems.push(`item ${i + 1}: missing name`);
          const url = str(item["item"]) ?? (target ? str(target["@id"]) : null);
          if (i < items.length - 1 && !(url && /^https?:\/\//.test(url)))
            problems.push(`item ${i + 1}: missing absolute URL`);
        });
      }
      return problems.length ? fail(p.url, { problems }) : pass(p.url);
    }),
);
