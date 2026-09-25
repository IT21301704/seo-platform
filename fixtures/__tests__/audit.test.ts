// Phase 1 accuracy proof (REQUIREMENTS Part J):
//  - golden site scores exactly 100;
//  - every broken site fails exactly its planted faults (and nothing else);
//  - 10 runs per fixture give byte-identical reports;
//  - reports match the committed snapshots (CI gate: changes need a RULESET_VERSION bump).
import { existsSync, readFileSync } from "node:fs";
import type { Fetcher } from "@seo/crawler";
import { PlaywrightRenderer } from "@seo/crawler/playwright";
import { serializeReport } from "@seo/scoring";
import { RULESET_VERSION } from "@seo/shared";
import { afterAll, describe, expect, it } from "vitest";
import { auditFixture, failures, reportPath } from "./audit-helpers";
import { brokenSiteNames, readExpectation } from "./helpers";

const FIXTURES = ["golden-site", ...brokenSiteNames()];
const RUNS = 10;
const renderers: PlaywrightRenderer[] = [];
const makeRenderer = (fetcher: Fetcher) => {
  const r = new PlaywrightRenderer(fetcher);
  renderers.push(r);
  return r;
};
afterAll(async () => {
  await Promise.all(renderers.map((r) => r.close()));
});

describe.each(FIXTURES)("%s", (fixture) => {
  const expectation = readExpectation(fixture);

  it(
    `is deterministic: ${RUNS} runs give byte-identical reports`,
    async () => {
      const hashes = new Set<string>();
      for (let i = 0; i < RUNS; i++) hashes.add((await auditFixture(fixture, makeRenderer)).reportHash);
      expect(hashes.size).toBe(1);
    },
    120_000,
  );

  it("fails exactly the expected rules on the expected URLs", async () => {
    const result = await auditFixture(fixture, makeRenderer);
    const expected = expectation.expectedFailures.map((f) => `${f.ruleId} ${f.url ?? "site"}`).sort();
    expect(failures(result)).toEqual(expected);
  }, 60_000);

  it("has the expected Health Score", async () => {
    const result = await auditFixture(fixture, makeRenderer);
    expect(result.report.score.health).toBe(expectation.expectedScore);
    if (fixture === "golden-site") expect(result.report.score.health).toBe(100);
  }, 60_000);

  it("matches the committed report snapshot (regression gate)", async () => {
    const path = reportPath(fixture);
    expect(existsSync(path), `missing ${path}: run pnpm fixtures:update`).toBe(true);
    const committed = readFileSync(path, "utf8");
    const current = serializeReport((await auditFixture(fixture, makeRenderer)).report);
    const committedVersion = (JSON.parse(committed) as { versions: { rulesetVersion: string } }).versions.rulesetVersion;
    if (current !== committed) {
      const hint =
        committedVersion === RULESET_VERSION
          ? `Fixture results changed but RULESET_VERSION is still ${RULESET_VERSION}. Bump it in packages/shared/src/versions.ts, then run pnpm fixtures:update.`
          : "RULESET_VERSION was bumped: run pnpm fixtures:update to record the new results.";
      expect.fail(`${fixture}: report differs from ${path}. ${hint}`);
    }
  }, 60_000);
});
