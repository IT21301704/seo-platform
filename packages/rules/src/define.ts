import type { SiteFacts, SitePage } from "@seo/crawler";
import type { JsonValue, ScoredCategory, Severity } from "@seo/shared";
import type { FixType, RuleDefinition, RuleOutcome } from "./types";

type Evidence = Record<string, JsonValue>;

const IMPACT_BY_SEVERITY: Record<Severity, number> = { critical: 5, high: 4, medium: 3, low: 2 };

type RuleMeta = Omit<
  RuleDefinition,
  "version" | "scoreCategory" | "impact" | "confidence" | "effort" | "evaluate"
> &
  Partial<Pick<RuleDefinition, "version" | "scoreCategory" | "impact" | "confidence" | "effort">>;

export function defineRule(
  meta: RuleMeta,
  evaluate: (site: SiteFacts) => RuleOutcome[],
): RuleDefinition {
  const scoreCategory = meta.scoreCategory ?? (meta.category as ScoredCategory);
  return {
    version: "1.0.0",
    impact: IMPACT_BY_SEVERITY[meta.severity],
    confidence: 1,
    effort: 1,
    ...meta,
    scoreCategory,
    evaluate,
  };
}

export const pass = (url: string | null, evidence: Evidence = {}): RuleOutcome => ({
  url,
  result: "pass",
  evidence,
});
export const fail = (url: string | null, evidence: Evidence = {}): RuleOutcome => ({
  url,
  result: "fail",
  evidence,
});
export const na = (url: string | null, reason: string): RuleOutcome => ({
  url,
  result: "na",
  evidence: { reason },
});

/** Page filters used by most rules. */
export const indexable = (p: SitePage): boolean => p.isIndexable;
export const html200 = (p: SitePage): boolean => p.isHtml200;

/**
 * Runs check() on every matching page. check() returns an outcome, or null to skip the page
 * (it has nothing this rule looks at).
 */
export function forPages(
  site: SiteFacts,
  filter: (page: SitePage) => boolean,
  check: (page: SitePage) => RuleOutcome | null,
): RuleOutcome[] {
  const out: RuleOutcome[] = [];
  for (const page of site.pages) {
    if (!filter(page) || !page.facts) continue;
    const outcome = check(page);
    if (outcome) out.push(outcome);
  }
  return out;
}

export function fixType(rule: Pick<RuleDefinition, "autoFixable" | "riskLevel">): FixType {
  if (!rule.autoFixable) return "guide";
  return rule.riskLevel === "low" ? "auto-low" : "auto-approve";
}
