import { defineRule, fail, pass } from "../src/define";

export const TEC_002 = defineRule(
  {
    id: "TEC-002",
    category: "technical",
    severity: "critical",
    title: "Important pages are blocked by robots.txt",
    passCondition:
      "Passes when robots.txt allows Googlebot to crawl every important page (home, main navigation pages and the pages their main content links to).",
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "high",
    effort: 1,
    explanation: {
      why: "Google cannot crawl a page that robots.txt disallows, so it cannot read its content and will rarely show it in results.",
      fix: [
        "Remove the Disallow rule that matches these URLs, or add a more specific Allow rule.",
        "Test the URL with the robots.txt report in Search Console.",
      ],
    },
  },
  (site) =>
    site.importantUrls.map((url) =>
      site.isAllowedForGooglebot(url) ? pass(url) : fail(url, { blockedFor: "Googlebot" }),
    ),
);
