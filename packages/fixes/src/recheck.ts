// Rule-engine judgement of proposed and published values. The LLM never decides whether a fix
// is acceptable: the same rules that found the problem must pass (CLAUDE.md rule 1).
import { buildSiteFacts, normalizeUrl } from "@seo/crawler";
import type { CrawlSnapshot, OwnerIntent, SiteFacts } from "@seo/crawler";
import type { WpRef, WpValue } from "@seo/integrations";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  RULES_BY_ID,
  TITLE_MAX,
  TITLE_MIN,
  evaluateRule,
} from "@seo/rules";
import type { RuleOutcome } from "@seo/rules";
import type { JsonValue } from "@seo/shared";
import { FIX_KINDS } from "./kinds";
import type { FixKind } from "./kinds";
import { simulate } from "./simulate";

export interface CheckableFix {
  id: string;
  kind: FixKind;
  url: string;
  ref: WpRef;
  value: WpValue;
}

export interface FixCheck {
  /** "pass", or a short reason shown in the review table ("Too short (min 70)"). */
  result: string;
  detail: string | null;
}

const pathOf = (url: unknown): string => {
  try {
    return new URL(String(url)).pathname;
  } catch {
    return String(url);
  }
};

/** Short, owner-friendly reason for a failing outcome. */
export function reasonLabel(ruleId: string, evidence: Record<string, JsonValue>): string {
  switch (ruleId) {
    case "ONP-004": {
      const problem = evidence["problem"];
      if (problem === "missing") return "Empty";
      if (problem === "too short") return `Too short (min ${DESCRIPTION_MIN})`;
      if (problem === "too long") return `Too long (max ${DESCRIPTION_MAX})`;
      const same = evidence["sameAs"];
      return `Duplicate of ${pathOf(Array.isArray(same) ? same[0] : "")}`;
    }
    case "ONP-001":
      return "Empty";
    case "ONP-002": {
      const same = evidence["sameTitleAs"];
      return `Duplicate of ${pathOf(Array.isArray(same) ? same[0] : "")}`;
    }
    case "ONP-003":
      return Number(evidence["length"] ?? 0) < TITLE_MIN
        ? `Too short (min ${TITLE_MIN})`
        : `Too long (max ${TITLE_MAX})`;
    case "ONP-008":
      return "Image still has no alt text";
    case "LNK-002":
      return "Link still broken";
    case "IDX-002":
      return `Canonical problem: ${String(evidence["problem"] ?? "invalid")}`;
    case "TEC-004":
      return "Still more than one redirect hop";
    default:
      return `${ruleId} still fails`;
  }
}

/** URL whose outcome decides a fix (null = site-level outcome). */
function outcomeUrl(fix: CheckableFix, origin: string): string | null {
  if (fix.kind === "robots_sitemap") return null;
  if (fix.kind === "redirect" && fix.ref.from) return new URL(fix.ref.from, origin).toString();
  return fix.url;
}

function emptyValue(fix: CheckableFix): boolean {
  if (fix.kind === "redirect") {
    const to = (fix.value as { to?: unknown } | null)?.to;
    return typeof to !== "string" || to.trim() === "";
  }
  const input = FIX_KINDS[fix.kind].input;
  if (input === "fixed")
    return fix.value === null || (Array.isArray(fix.value) && fix.value.length === 0);
  return typeof fix.value !== "string" || fix.value.trim() === "";
}

function invalidUrl(fix: CheckableFix, origin: string): string | null {
  if (fix.kind !== "canonical" && fix.kind !== "link") return null;
  const url = normalizeUrl(String(fix.value));
  if (!url) return "Not a valid URL";
  if (new URL(url).origin !== origin) return "Must be a page on this site";
  return null;
}

/** Fixes whose page-level outcome is not enough on its own (several items per page). */
function itemCheck(fix: CheckableFix, site: SiteFacts): FixCheck | null {
  const page = site.pageByUrl.get(fix.url);
  if (fix.kind === "image_alt") {
    const img = page?.facts?.images.find((i) => (i.url ?? i.src) === fix.ref.src);
    return img && img.alt ? null : { result: "Image still has no alt text", detail: null };
  }
  if (fix.kind === "link") {
    const target = site.pageByUrl.get(String(fix.value));
    if (!target) return { result: "Target page was not in the audit", detail: String(fix.value) };
    if (target.record.status !== 200 || target.record.chain.length > 0) {
      return {
        result: `Target returns ${target.record.status ?? "an error"}`,
        detail: String(fix.value),
      };
    }
    const stillLinked = page?.facts?.links.some((l) => l.url === normalizeUrl(fix.ref.from ?? ""));
    return stillLinked ? { result: "Link still broken", detail: null } : null;
  }
  if (fix.kind === "sitemap_exclude" && site.sitemapEntries.has(fix.url)) {
    return { result: "Still listed in the sitemap", detail: null };
  }
  if (fix.kind === "sitemap_include" && !site.sitemapEntries.has(fix.url)) {
    return { result: "Not listed in the sitemap", detail: null };
  }
  return null;
}

/** Runs the kind's rules on `site` and returns a check per fix. */
export function checkFixesOn(
  site: SiteFacts,
  fixes: readonly CheckableFix[],
): Map<string, FixCheck> {
  const results = new Map<string, FixCheck>();
  const kinds = new Set(fixes.map((f) => f.kind));
  const outcomes = new Map<string, RuleOutcome[]>();
  for (const kind of kinds) {
    for (const ruleId of FIX_KINDS[kind].recheckRules) {
      const rule = RULES_BY_ID.get(ruleId);
      if (rule && !outcomes.has(ruleId)) outcomes.set(ruleId, evaluateRule(rule, site));
    }
  }
  for (const fix of fixes) {
    const item = itemCheck(fix, site);
    if (item) {
      results.set(fix.id, item);
      continue;
    }
    const url = outcomeUrl(fix, site.origin);
    let failed: FixCheck | null = null;
    for (const ruleId of FIX_KINDS[fix.kind].recheckRules) {
      if (fix.kind === "image_alt" || fix.kind === "link") break;
      const outcome = outcomes.get(ruleId)?.find((o) => o.url === url && o.result === "fail");
      if (outcome) {
        failed = { result: reasonLabel(ruleId, outcome.evidence), detail: ruleId };
        break;
      }
    }
    results.set(fix.id, failed ?? { result: "pass", detail: null });
  }
  return results;
}

/**
 * Preview re-check: applies every proposed value to the audit snapshot at once (so drafts that
 * duplicate each other are caught) and re-runs the rules.
 */
export function recheckProposals(
  snapshot: CrawlSnapshot,
  ownerIntent: OwnerIntent,
  fixes: readonly CheckableFix[],
): Map<string, FixCheck> {
  const results = new Map<string, FixCheck>();
  const valid: CheckableFix[] = [];
  for (const fix of fixes) {
    if (emptyValue(fix)) results.set(fix.id, { result: "Empty", detail: null });
    else {
      const bad = invalidUrl(fix, snapshot.origin);
      if (bad) results.set(fix.id, { result: bad, detail: null });
      else valid.push(fix);
    }
  }
  if (valid.length === 0) return results;
  const site = buildSiteFacts(simulate(snapshot, valid), { ownerIntent });
  for (const [id, check] of checkFixesOn(site, valid)) results.set(id, check);
  return results;
}
