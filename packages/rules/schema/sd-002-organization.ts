import { defineRule, fail, na, pass } from "../src/define";
import { nodesOfType, str } from "../src/helpers";

export const SD_002 = defineRule(
  {
    id: "SD-002",
    category: "schema",
    severity: "medium",
    title: "Home page has no Organization structured data",
    passCondition: "Passes when the home page has an Organization (or LocalBusiness) item with name, url and logo or image.",
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "high",
    effort: 2,
    explanation: {
      why: "Organization markup tells search engines and AI assistants your official name, logo and profiles, which helps them describe your business correctly.",
      fix: ["Fill in the organization/business details in your SEO plugin (name, logo, social profiles)."],
    },
  },
  (site) => {
    const home = site.pageByUrl.get(site.rootUrl);
    if (!home?.isHtml200 || !home.facts) return [na(site.rootUrl, "Home page not available")];
    const orgs = nodesOfType(home.facts, "Organization");
    if (orgs === null) return [na(site.rootUrl, "JSON-LD invalid (see SD-001)")];
    const complete = orgs.find((o) => str(o["name"]) && str(o["url"]) && (o["logo"] || o["image"]));
    if (complete) return [pass(site.rootUrl, { name: str(complete["name"]) })];
    return [fail(site.rootUrl, { found: orgs.length, problem: orgs.length ? "missing name, url or logo" : "no Organization" })];
  },
);
