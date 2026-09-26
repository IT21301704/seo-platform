import { fixType } from "@seo/rules";
import type { FixType, RuleOutcome, RuleResult } from "@seo/rules";
import {
  CATEGORY_WEIGHTS_V1,
  SCORED_CATEGORIES,
  SEVERITY_WEIGHTS,
  WEIGHTS_VERSION,
} from "@seo/shared";
import type {
  AppliesTo,
  Category,
  CheckResult,
  InputType,
  RiskLevel,
  ScoredCategory,
  Severity,
} from "@seo/shared";
import { priorityOf, round } from "./priority";
import type { PriorityBreakdown } from "./priority";

export const REPORT_SCHEMA_VERSION = 1;

export interface RuleReport {
  ruleId: string;
  version: string;
  title: string;
  category: Category;
  scoreCategory: ScoredCategory;
  severity: Severity;
  appliesTo: AppliesTo;
  autoFixable: boolean;
  riskLevel: RiskLevel;
  fixType: FixType;
  status: CheckResult;
  counts: { pass: number; fail: number; na: number };
  /** Share of applicable checks that pass (null when not applicable). */
  passRatio: number | null;
  priority: PriorityBreakdown;
  outcomes: RuleOutcome[];
}

export interface AuditReport {
  reportSchema: number;
  versions: {
    crawlerVersion: string;
    rulesetVersion: string;
    weightsVersion: string;
    snapshotSetHash: string;
  };
  inputType: InputType;
  rootUrl: string;
  crawledAt: string;
  score: {
    /** 0–100, rounded; null only if nothing at all was applicable. */
    health: number | null;
    categories: Record<ScoredCategory, number | null>;
    /** Separate Sitemap score from SMP rules (REQUIREMENTS M6). */
    sitemap: number | null;
  };
  /** Failing checks (rule × page) per severity, and passing checks. */
  counts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    passed: number;
    notApplicable: number;
  };
  pages: { crawled: number; indexable: number; rendered: number };
  rules: RuleReport[];
}

export interface ReportInput {
  results: RuleResult[];
  versions: AuditReport["versions"];
  inputType: InputType;
  rootUrl: string;
  crawledAt: string;
  pages: AuditReport["pages"];
}

function ruleReport({ rule, outcomes }: RuleResult): RuleReport {
  const counts = { pass: 0, fail: 0, na: 0 };
  for (const o of outcomes) counts[o.result] += 1;
  const applicable = counts.pass + counts.fail;
  return {
    ruleId: rule.id,
    version: rule.version,
    title: rule.title,
    category: rule.category,
    scoreCategory: rule.scoreCategory,
    severity: rule.severity,
    appliesTo: rule.appliesTo,
    autoFixable: rule.autoFixable,
    riskLevel: rule.riskLevel,
    fixType: fixType(rule),
    status: applicable === 0 ? "na" : counts.fail > 0 ? "fail" : "pass",
    counts,
    passRatio: applicable === 0 ? null : round(counts.pass / applicable, 4),
    priority: priorityOf(rule, outcomes),
    outcomes,
  };
}

/**
 * Score = Σ(wᵢ × passRatioᵢ) ÷ Σ(wᵢ) × 100 over applicable rules, wᵢ = severity weight.
 * Not-applicable rules are left out of the denominator.
 */
export function weightedScore(rules: RuleReport[]): number | null {
  let earned = 0;
  let possible = 0;
  for (const r of rules) {
    if (r.passRatio === null) continue;
    const w = SEVERITY_WEIGHTS[r.severity];
    earned += w * r.passRatio;
    possible += w;
  }
  return possible === 0 ? null : (earned / possible) * 100;
}

/**
 * Health = Σ(category weight × category score), rounded. Categories with no applicable rule
 * (e.g. performance without measurements) are left out and the other weights re-normalised.
 */
export function healthScore(categories: Record<ScoredCategory, number | null>): number | null {
  let total = 0;
  let weights = 0;
  for (const c of SCORED_CATEGORIES) {
    const score = categories[c];
    if (score === null) continue;
    total += CATEGORY_WEIGHTS_V1[c] * score;
    weights += CATEGORY_WEIGHTS_V1[c];
  }
  return weights === 0 ? null : Math.round(round(total / weights, 6));
}

export function buildReport(input: ReportInput): AuditReport {
  const rules = input.results.map(ruleReport);
  const raw = Object.fromEntries(
    SCORED_CATEGORIES.map((c) => [c, weightedScore(rules.filter((r) => r.scoreCategory === c))]),
  ) as Record<ScoredCategory, number | null>;
  const categories = Object.fromEntries(
    SCORED_CATEGORIES.map((c) => [c, raw[c] === null ? null : Math.round(round(raw[c] ?? 0, 6))]),
  ) as Record<ScoredCategory, number | null>;
  const sitemapRaw = weightedScore(rules.filter((r) => r.category === "sitemap"));

  const counts = { critical: 0, high: 0, medium: 0, low: 0, passed: 0, notApplicable: 0 };
  for (const r of rules) {
    counts[r.severity] += r.counts.fail;
    counts.passed += r.counts.pass;
    counts.notApplicable += r.counts.na;
  }

  return {
    reportSchema: REPORT_SCHEMA_VERSION,
    versions: { ...input.versions, weightsVersion: WEIGHTS_VERSION },
    inputType: input.inputType,
    rootUrl: input.rootUrl,
    crawledAt: input.crawledAt,
    score: {
      health: healthScore(raw),
      categories,
      sitemap: sitemapRaw === null ? null : Math.round(round(sitemapRaw, 6)),
    },
    counts,
    pages: input.pages,
    rules,
  };
}
