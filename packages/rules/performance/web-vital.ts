import type { PerformancePage } from "@seo/crawler";
import type { Severity } from "@seo/shared";
import { defineRule, fail, pass } from "../src/define";
import type { RuleDefinition } from "../src/types";

interface VitalSpec {
  id: string;
  metric: "lcp" | "inp" | "cls";
  name: string;
  good: string;
  severity: Severity;
  why: string;
  fix: string[];
}

/** Core Web Vitals rules: scored in bands (good = pass), never on raw milliseconds. */
export function webVitalRule(spec: VitalSpec): RuleDefinition {
  return defineRule(
    {
      id: spec.id,
      category: "performance",
      severity: spec.severity,
      title: `${spec.name} is not in the "good" band on mobile`,
      passCondition: `Passes when ${spec.name} is in the "good" band (${spec.good}) for each sampled page. Uses real-user CrUX data when available, otherwise the median of 5 Lighthouse runs. Not applicable when no measurement is available.`,
      appliesTo: "url",
      autoFixable: false,
      riskLevel: "medium",
      effort: 4,
      explanation: { why: spec.why, fix: spec.fix },
    },
    (site) =>
      site.performance.pages
        .filter((p: PerformancePage) => p[spec.metric] !== null)
        .map((p) => {
          const evidence = {
            band: p[spec.metric],
            basis: p.basis,
            source: site.performance.source,
          };
          return p[spec.metric] === "good" ? pass(p.url, evidence) : fail(p.url, evidence);
        }),
  );
}
