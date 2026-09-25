import type { RuleDefinition, RuleOutcome } from "@seo/rules";

export interface PriorityBreakdown {
  impact: number;
  confidence: number;
  /** 1.0 for one failing page, rising to 2.0 at 20+ pages; site-wide issues count as 2.0. */
  pagesFactor: number;
  effort: number;
  failingItems: number;
  priority: number;
}

export const round = (value: number, decimals: number): number => {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
};

/** Pages factor: 1 + n/20, capped at 2 (so 20+ affected pages doubles the priority). */
export function pagesFactor(outcomes: RuleOutcome[]): number {
  const failing = outcomes.filter((o) => o.result === "fail");
  if (failing.length === 0) return 0;
  if (failing.every((o) => o.url === null)) return 2;
  return round(Math.min(2, 1 + failing.length / 20), 2);
}

/** Priority = Impact × Confidence × Pages factor ÷ Effort (REQUIREMENTS M6), one decimal. */
export function priorityOf(rule: RuleDefinition, outcomes: RuleOutcome[]): PriorityBreakdown {
  const factor = pagesFactor(outcomes);
  const failingItems = outcomes.filter((o) => o.result === "fail").length;
  const priority = failingItems === 0 ? 0 : round((rule.impact * rule.confidence * factor) / rule.effort, 1);
  return {
    impact: rule.impact,
    confidence: rule.confidence,
    pagesFactor: factor,
    effort: rule.effort,
    failingItems,
    priority,
  };
}
