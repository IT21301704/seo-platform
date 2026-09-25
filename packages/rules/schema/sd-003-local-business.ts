import { defineRule, fail, forPages, indexable, pass } from "../src/define";
import { nodesOfType, obj, str } from "../src/helpers";

export const SD_003 = defineRule(
  {
    id: "SD-003",
    category: "schema",
    severity: "medium",
    title: "LocalBusiness structured data is incomplete",
    passCondition:
      "Passes when every LocalBusiness item has name, telephone and an address with streetAddress, addressLocality and addressCountry.",
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "high",
    effort: 2,
    explanation: {
      why: "Complete business details help Google and AI assistants show your address, phone and opening hours for local searches.",
      fix: ["Add the missing fields in your SEO plugin's local business settings, matching your Google Business Profile."],
    },
  },
  (site) =>
    forPages(site, indexable, (p) => {
      const businesses = p.facts ? nodesOfType(p.facts, "LocalBusiness") : null;
      if (!businesses?.length) return null;
      const missing = new Set<string>();
      for (const b of businesses) {
        const address = obj(b["address"]);
        if (!str(b["name"])) missing.add("name");
        if (!str(b["telephone"])) missing.add("telephone");
        for (const field of ["streetAddress", "addressLocality", "addressCountry"]) {
          if (!str(address?.[field])) missing.add(`address.${field}`);
        }
      }
      return missing.size ? fail(p.url, { missing: [...missing].sort() }) : pass(p.url);
    }),
);
