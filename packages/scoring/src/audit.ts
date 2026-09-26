import { buildSiteFacts, sha256, snapshotSetHash } from "@seo/crawler";
import type { CrawlSnapshot, OwnerIntent, SiteFacts } from "@seo/crawler";
import { runRules } from "@seo/rules";
import type { RuleResult } from "@seo/rules";
import { CODE_VERSIONS, stableStringify } from "@seo/shared";
import { buildReport } from "./report";
import type { AuditReport } from "./report";

export interface AuditOptions {
  ownerIntent?: OwnerIntent;
}

export interface AuditResult {
  report: AuditReport;
  /** SHA-256 of the report's canonical JSON: equal hashes = byte-identical reports. */
  reportHash: string;
  site: SiteFacts;
  results: RuleResult[];
}

/**
 * The deterministic core: snapshot → facts → rules → scores. No network, no clock, no LLM.
 * Same snapshot + same versions = byte-identical report.
 */
export function runAudit(snapshot: CrawlSnapshot, options: AuditOptions = {}): AuditResult {
  const site = buildSiteFacts(
    snapshot,
    options.ownerIntent ? { ownerIntent: options.ownerIntent } : {},
  );
  const results = runRules(site);
  const report = buildReport({
    results,
    versions: {
      crawlerVersion: snapshot.crawlerVersion,
      rulesetVersion: CODE_VERSIONS.rulesetVersion,
      weightsVersion: CODE_VERSIONS.weightsVersion,
      snapshotSetHash: snapshotSetHash(snapshot),
    },
    inputType: snapshot.inputType,
    rootUrl: snapshot.rootUrl,
    crawledAt: snapshot.crawledAt,
    pages: {
      crawled: snapshot.pages.length,
      indexable: site.pages.filter((p) => p.isIndexable).length,
      rendered: snapshot.pages.filter((p) => p.renderedHtml !== null).length,
    },
  });
  return { report, reportHash: sha256(serializeReport(report)), site, results };
}

/** Canonical bytes of a report (sorted keys, 2-space indent, trailing newline). */
export function serializeReport(report: AuditReport): string {
  return `${stableStringify(report, 2)}\n`;
}
