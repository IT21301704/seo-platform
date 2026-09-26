import { defineRule, fail, na, pass } from "../src/define";
import { isType, obj, schemaNodes, str } from "../src/helpers";

const digits = (s: string): string => s.replace(/\D/g, "");

export const AI_004 = defineRule(
  {
    id: "AI-004",
    category: "ai",
    severity: "medium",
    title: "Business name, address or phone differ across the site",
    passCondition:
      "Passes when every page uses one business name (structured data and og:site_name), one phone number (tel: links and structured data) and one street address.",
    appliesTo: "both",
    autoFixable: false,
    riskLevel: "low",
    effort: 2,
    explanation: {
      why: "Search engines and AI assistants cross-check your name, address and phone. Conflicting versions make them less confident about which is correct.",
      fix: [
        "Use one exact spelling of the name, address and phone everywhere, matching your Google Business Profile.",
      ],
    },
  },
  (site) => {
    const names = new Set<string>();
    const phones = new Set<string>();
    const streets = new Set<string>();
    for (const p of site.pages) {
      if (!p.isHtml200 || !p.facts) continue;
      const siteName = p.facts.og["og:site_name"];
      if (siteName) names.add(siteName.toLowerCase());
      for (const link of p.facts.links) {
        if (/^tel:/i.test(link.href)) phones.add(digits(link.href));
      }
      for (const node of schemaNodes(p.facts) ?? []) {
        if (!isType(node, "Organization")) continue;
        const name = str(node["name"]);
        if (name) names.add(name.toLowerCase());
        const phone = str(node["telephone"]);
        if (phone) phones.add(digits(phone));
        const street = str(obj(node["address"])?.["streetAddress"]);
        if (street) streets.add(street.toLowerCase());
      }
    }
    if (names.size + phones.size + streets.size === 0)
      return [na(null, "No business name, phone or address found")];
    const conflicts: Record<string, string[]> = {};
    if (names.size > 1) conflicts["names"] = [...names].sort();
    if (phones.size > 1) conflicts["phones"] = [...phones].sort();
    if (streets.size > 1) conflicts["addresses"] = [...streets].sort();
    return [Object.keys(conflicts).length ? fail(null, conflicts) : pass(null)];
  },
);
