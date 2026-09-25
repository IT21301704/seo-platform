import type { SiteFacts } from "@seo/crawler";
import type {
  AppliesTo,
  Category,
  CheckResult,
  JsonValue,
  RiskLevel,
  ScoredCategory,
  Severity,
} from "@seo/shared";

/** One check result: a rule applied to one URL (or the whole site when url is null). */
export interface RuleOutcome {
  url: string | null;
  result: CheckResult;
  evidence: Record<string, JsonValue>;
}

export type FixType = "auto-low" | "auto-approve" | "manual" | "guide";

export interface RuleDefinition {
  /** e.g. "ONP-004". */
  id: string;
  /** Bump when the rule's logic changes (and bump RULESET_VERSION). */
  version: string;
  category: Category;
  /** Health Score category this rule counts in (sitemap rules count in technical/indexing). */
  scoreCategory: ScoredCategory;
  severity: Severity;
  title: string;
  /** "Passes when ..." shown on the issue detail page. */
  passCondition: string;
  appliesTo: AppliesTo;
  autoFixable: boolean;
  riskLevel: RiskLevel;
  /** Priority inputs (REQUIREMENTS M6): Impact 1–5, Confidence 0–1, Effort 1–5. */
  impact: number;
  confidence: number;
  effort: number;
  /** Template explanation used when the LLM is unavailable (and as its grounding). */
  explanation: { why: string; fix: string[] };
  /** Pure function: no network, no randomness, no clock. */
  evaluate(site: SiteFacts): RuleOutcome[];
}

export interface RuleResult {
  rule: RuleDefinition;
  /** Sorted by url (site-level null first). Empty evaluate() output becomes one "na". */
  outcomes: RuleOutcome[];
}
