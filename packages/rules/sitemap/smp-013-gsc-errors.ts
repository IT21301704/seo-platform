import { defineRule, fail, pass } from "../src/define";

export const SMP_013 = defineRule(
  {
    id: "SMP-013",
    category: "sitemap",
    scoreCategory: "indexing",
    severity: "high",
    title: "Search Console reports sitemap errors or warnings",
    passCondition:
      "Passes when Search Console reports no errors and no warnings for each submitted sitemap. Not applicable without a Search Console connection.",
    appliesTo: "url",
    autoFixable: false,
    riskLevel: "high",
    effort: 2,
    explanation: {
      why: "Errors mean Google could not read the sitemap (or parts of it); warnings often mean blocked or unreachable URLs.",
      fix: [
        "Open the sitemap in Search Console to see the error details.",
        "Fix the cause in the CMS or plugin that generates the sitemap, then resubmit.",
      ],
    },
  },
  (site) =>
    (site.gsc?.sitemaps ?? []).map((s) => {
      const evidence = {
        errors: s.errors,
        warnings: s.warnings,
        dataDate: site.gsc?.dataDate ?? null,
      };
      return s.errors > 0 || s.warnings > 0 ? fail(s.path, evidence) : pass(s.path, evidence);
    }),
);
