import { join } from "node:path";
import { RecordedPerformance, crawlSite, loadFixtureSite, renderSnapshot } from "@seo/crawler";
import type { Fetcher, Renderer } from "@seo/crawler";
import { runAudit } from "@seo/scoring";
import type { AuditResult } from "@seo/scoring";
import { EXPECTED_DIR, siteDir } from "./helpers";

export const REPORTS_DIR = join(EXPECTED_DIR, "reports");

export function reportPath(fixture: string): string {
  return join(REPORTS_DIR, `${fixture}.report.json`);
}

/** The full audit pipeline on a fixture: crawl → render → recorded performance → rules → scores. */
export async function auditFixture(
  fixture: string,
  makeRenderer: (fetcher: Fetcher) => Renderer,
): Promise<AuditResult> {
  const site = loadFixtureSite(siteDir(fixture));
  let snapshot = await crawlSite({
    rootUrl: site.server.origin,
    fetcher: site.fetcher,
    pageLimit: 1000,
    crawledAt: site.server.crawledAt,
  });
  snapshot = await renderSnapshot(snapshot, makeRenderer(site.fetcher));
  const performance = await new RecordedPerformance(site.server.performance).measure([snapshot.rootUrl]);
  return runAudit({ ...snapshot, performance }, { ownerIntent: site.server.ownerIntent });
}

/** "RULE-ID url" for every failing check, sorted. */
export function failures(result: AuditResult): string[] {
  return result.report.rules
    .flatMap((r) => r.outcomes.filter((o) => o.result === "fail").map((o) => `${r.ruleId} ${o.url ?? "site"}`))
    .sort();
}
