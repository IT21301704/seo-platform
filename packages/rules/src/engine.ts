import type { SiteFacts } from "@seo/crawler";
import { na } from "./define";
import { RULES } from "./registry";
import type { RuleDefinition, RuleOutcome, RuleResult } from "./types";

const byUrl = (a: RuleOutcome, b: RuleOutcome): number => {
  if (a.url === b.url) return 0;
  if (a.url === null) return -1;
  if (b.url === null) return 1;
  return a.url < b.url ? -1 : 1;
};

/**
 * Runs every rule against the site. Deterministic: rules in ID order, outcomes in URL order.
 * Server-dependent rules are "not applicable" for code uploads (REQUIREMENTS M3).
 */
export function runRules(site: SiteFacts, rules: readonly RuleDefinition[] = RULES): RuleResult[] {
  return [...rules]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((rule) => ({ rule, outcomes: evaluateRule(rule, site) }));
}

export function evaluateRule(rule: RuleDefinition, site: SiteFacts): RuleOutcome[] {
  if (site.inputType === "code" && rule.appliesTo === "url") {
    return [na(null, "Needs a live server; not applicable to code uploads")];
  }
  const outcomes = rule.evaluate(site);
  if (outcomes.length === 0) return [na(null, "Nothing on this site for this check")];
  const urls = outcomes.map((o) => o.url ?? "");
  if (new Set(urls).size !== urls.length) {
    throw new Error(`${rule.id} returned more than one outcome for the same URL`);
  }
  return [...outcomes].sort(byUrl);
}
