import type { RuleDefinition, RuleOutcome, RuleResult } from "@seo/rules";
import { describe, expect, it } from "vitest";
import { pagesFactor, priorityOf } from "./priority";
import { buildReport, healthScore, weightedScore } from "./report";

const rule = (id: string, severity: RuleDefinition["severity"], scoreCategory: RuleDefinition["scoreCategory"]): RuleDefinition => ({
  id,
  version: "1.0.0",
  category: scoreCategory,
  scoreCategory,
  severity,
  title: id,
  passCondition: "Passes when …",
  appliesTo: "both",
  autoFixable: false,
  riskLevel: "low",
  impact: 4,
  confidence: 1,
  effort: 1,
  explanation: { why: "", fix: [""] },
  evaluate: () => [],
});
const outcomes = (pass: number, fail: number, na = 0): RuleOutcome[] => [
  ...Array.from({ length: pass }, (_, i) => ({ url: `https://a.com/p${i}`, result: "pass" as const, evidence: {} })),
  ...Array.from({ length: fail }, (_, i) => ({ url: `https://a.com/f${i}`, result: "fail" as const, evidence: {} })),
  ...Array.from({ length: na }, (_, i) => ({ url: `https://a.com/n${i}`, result: "na" as const, evidence: {} })),
];

function report(results: RuleResult[]) {
  return buildReport({
    results,
    versions: { crawlerVersion: "1.0.0", rulesetVersion: "1.0.0", weightsVersion: "v1", snapshotSetHash: "x" },
    inputType: "url",
    rootUrl: "https://a.com/",
    crawledAt: "2026-09-25T00:00:00Z",
    pages: { crawled: 0, indexable: 0, rendered: 0 },
  });
}

describe("priority", () => {
  it("matches the wireframe example: ONP-004, 24 pages → 4 × 1.0 × 2.0 ÷ 1 = 8.0", () => {
    const p = priorityOf(rule("ONP-004", "high", "onpage"), outcomes(288, 24));
    expect(p).toMatchObject({ impact: 4, confidence: 1, pagesFactor: 2, effort: 1, priority: 8 });
  });

  it("scales the pages factor from 1.0 to 2.0 and treats site-wide issues as 2.0", () => {
    expect(pagesFactor(outcomes(0, 1))).toBe(1.05);
    expect(pagesFactor(outcomes(0, 10))).toBe(1.5);
    expect(pagesFactor(outcomes(0, 40))).toBe(2);
    expect(pagesFactor([{ url: null, result: "fail", evidence: {} }])).toBe(2);
    expect(pagesFactor(outcomes(5, 0))).toBe(0);
  });
});

describe("scores", () => {
  it("weights rules by severity and uses the share of pages passing", () => {
    const reports = report([
      { rule: rule("A-1", "critical", "onpage"), outcomes: outcomes(1, 1) }, // 10 × 0.5
      { rule: rule("A-2", "low", "onpage"), outcomes: outcomes(2, 0) }, // 1 × 1
    ]).rules;
    expect(weightedScore(reports)).toBeCloseTo((5 + 1) / 11 * 100, 10);
  });

  it("leaves not-applicable rules and categories out of the denominator", () => {
    const r = report([
      { rule: rule("A-1", "high", "onpage"), outcomes: outcomes(3, 0) },
      { rule: rule("A-2", "high", "onpage"), outcomes: outcomes(0, 0, 4) },
    ]);
    expect(r.score.categories.onpage).toBe(100);
    expect(r.score.categories.performance).toBeNull();
    expect(r.score.health).toBe(100);
  });

  it("combines category scores with the v1 weights", () => {
    const categories = { technical: 100, indexing: 50, onpage: 100, performance: null, links: 100, schema: 100, ai: 100 };
    // (20·100 + 15·50 + 20·100 + 10·100·3) / 85
    expect(healthScore(categories)).toBe(Math.round((2000 + 750 + 2000 + 3000) / 85));
  });

  it("counts failing checks by severity and passing checks", () => {
    const r = report([
      { rule: rule("A-1", "critical", "onpage"), outcomes: outcomes(2, 3) },
      { rule: rule("A-2", "medium", "links"), outcomes: outcomes(4, 1) },
    ]);
    expect(r.counts).toEqual({ critical: 3, high: 0, medium: 1, low: 0, passed: 6, notApplicable: 0 });
  });
});
