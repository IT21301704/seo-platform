/**
 * Version constants stored on every report.
 * Same input + same versions = same output (CLAUDE.md rule 2).
 *
 * Bump RULESET_VERSION whenever a rule or its severity changes.
 * Bump WEIGHTS_VERSION whenever a category weight changes.
 * Bump PROMPT_VERSION whenever an LLM prompt or output schema changes.
 */
export const CRAWLER_VERSION = "1.0.0";
export const RULESET_VERSION = "1.1.0";
export const WEIGHTS_VERSION = "v1";
export const PROMPT_VERSION = "v1.0";

/** The full fingerprint saved on every crawl/report. */
export interface VersionSet {
  crawlerVersion: string;
  rulesetVersion: string;
  weightsVersion: string;
  promptVersion: string;
  /** From the LLM_MODEL_ID environment variable at run time. */
  llmModelId: string;
  /** SHA-256 over the sorted page content hashes of the crawl. */
  snapshotSetHash: string;
}

export const CODE_VERSIONS = {
  crawlerVersion: CRAWLER_VERSION,
  rulesetVersion: RULESET_VERSION,
  weightsVersion: WEIGHTS_VERSION,
  promptVersion: PROMPT_VERSION,
} as const satisfies Omit<VersionSet, "llmModelId" | "snapshotSetHash">;
