// Writes fixtures/expected/reports/<fixture>.report.json and the expectedScore of broken sites.
// Refuses to change a committed report unless RULESET_VERSION was bumped (CLAUDE.md rule 3).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PlaywrightRenderer } from "@seo/crawler/playwright";
import { serializeReport } from "@seo/scoring";
import { RULESET_VERSION } from "@seo/shared";
import { REPORTS_DIR, auditFixture, reportPath } from "../__tests__/audit-helpers";
import { EXPECTED_DIR, brokenSiteNames } from "../__tests__/helpers";

const renderers: PlaywrightRenderer[] = [];
const blocked: string[] = [];
mkdirSync(REPORTS_DIR, { recursive: true });

for (const fixture of ["golden-site", ...brokenSiteNames()]) {
  const result = await auditFixture(fixture, (fetcher) => {
    const r = new PlaywrightRenderer(fetcher);
    renderers.push(r);
    return r;
  });
  const next = serializeReport(result.report);
  const path = reportPath(fixture);
  if (existsSync(path)) {
    const current = readFileSync(path, "utf8");
    const version = (JSON.parse(current) as { versions: { rulesetVersion: string } }).versions.rulesetVersion;
    if (current !== next && version === RULESET_VERSION) {
      blocked.push(fixture);
      continue;
    }
  }
  writeFileSync(path, next);

  const expectedPath = join(EXPECTED_DIR, `${fixture}.json`);
  const expected = JSON.parse(readFileSync(expectedPath, "utf8")) as Record<string, unknown>;
  expected["expectedScore"] = result.report.score.health;
  expected["rulesetVersion"] = RULESET_VERSION;
  writeFileSync(expectedPath, `${JSON.stringify(expected, null, 2)}\n`);
  console.log(`${fixture.padEnd(18)} health ${result.report.score.health}  hash ${result.reportHash.slice(0, 12)}`);
}
await Promise.all(renderers.map((r) => r.close()));

if (blocked.length) {
  console.error(
    `\nResults changed for ${blocked.join(", ")} but RULESET_VERSION is still ${RULESET_VERSION}.\n` +
      "Bump RULESET_VERSION in packages/shared/src/versions.ts and run this again.",
  );
  process.exit(1);
}
