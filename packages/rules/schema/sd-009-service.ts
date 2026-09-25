import { defineRule, fail, forPages, indexable, pass } from "../src/define";
import { nodesOfType, str } from "../src/helpers";

export const SD_009 = defineRule(
  {
    id: "SD-009",
    category: "schema",
    severity: "low",
    title: "Service structured data is incomplete",
    passCondition: "Passes when every Service item has a name, a provider and a serviceType or description.",
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "high",
    effort: 1,
    explanation: {
      why: "Service markup helps AI assistants and search engines understand exactly what you offer and who provides it.",
      fix: ["Add the provider (your business) and a short description to each Service item."],
    },
  },
  (site) =>
    forPages(site, indexable, (p) => {
      const services = p.facts ? nodesOfType(p.facts, "Service") : null;
      if (!services?.length) return null;
      const problems = new Set<string>();
      for (const s of services) {
        if (!str(s["name"])) problems.add("name");
        if (!s["provider"]) problems.add("provider");
        if (!str(s["serviceType"]) && !str(s["description"])) problems.add("serviceType or description");
      }
      return problems.size ? fail(p.url, { problems: [...problems].sort() }) : pass(p.url);
    }),
);
