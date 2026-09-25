import { defineRule, fail, pass } from "../src/define";

export const TEC_001 = defineRule(
  {
    id: "TEC-001",
    category: "technical",
    severity: "high",
    title: "robots.txt is missing or invalid",
    passCondition:
      "Passes when /robots.txt returns 200 with only valid directives, or 404 (no restrictions). Fails on 5xx, network errors or unknown directives.",
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "high",
    effort: 1,
    explanation: {
      why: "Search engines read robots.txt before crawling. When it errors, Google may stop crawling the whole site; invalid lines are silently ignored, so rules may not do what you expect.",
      fix: [
        "Make /robots.txt return HTTP 200 as plain text.",
        "Use only User-agent, Allow, Disallow and Sitemap lines.",
        "Change it in your CMS or SEO plugin so the next deploy keeps the fix.",
      ],
    },
  },
  (site) => {
    const { status, error, parsed } = site.robots;
    if (status === 200) {
      return parsed.invalidLines.length === 0
        ? [pass(site.robots.url, { status })]
        : [fail(site.robots.url, { status, invalidLines: parsed.invalidLines })];
    }
    if (status === 404 || status === 410) {
      return [pass(site.robots.url, { status, note: "No robots.txt: all crawling allowed" })];
    }
    return [fail(site.robots.url, { status, error })];
  },
);
