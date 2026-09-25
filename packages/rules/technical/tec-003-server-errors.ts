import { defineRule, fail, pass } from "../src/define";

export const TEC_003 = defineRule(
  {
    id: "TEC-003",
    category: "technical",
    severity: "high",
    title: "Pages return server errors (5xx) or fail to load",
    passCondition:
      "Passes when every crawled URL responds without a 5xx status or connection error. (4xx is reported by LNK-002 and SMP-007.)",
    appliesTo: "url",
    autoFixable: false,
    riskLevel: "high",
    effort: 3,
    explanation: {
      why: "Server errors stop search engines and visitors from reading the page. Repeated 5xx errors make Google crawl the site less often.",
      fix: [
        "Check the server or hosting error logs for these URLs.",
        "Fix the failing plugin, database query or timeout, then re-run the audit.",
      ],
    },
  },
  (site) =>
    site.pages.map(({ url, record }) => {
      if (record.status === null) return fail(url, { error: record.error });
      return record.status >= 500 ? fail(url, { status: record.status }) : pass(url, { status: record.status });
    }),
);
