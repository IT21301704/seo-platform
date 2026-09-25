import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { RULESET_VERSION } from "@seo/shared";
import { describe, expect, it } from "vitest";
import {
  EXPECTED_DIR,
  brokenSiteNames,
  listFiles,
  readExpectation,
  readFixtureServer,
  siteDir,
} from "./helpers";

const ALL_FIXTURES = ["golden-site", ...brokenSiteNames()];

describe("fixture inventory", () => {
  it("has at least 5 broken sites", () => {
    expect(brokenSiteNames().length).toBeGreaterThanOrEqual(5);
  });

  it("has exactly one expected JSON per fixture", () => {
    const expectedFiles = readdirSync(EXPECTED_DIR).sort();
    expect(expectedFiles).toEqual(ALL_FIXTURES.map((f) => `${f}.json`).sort());
  });
});

describe.each(ALL_FIXTURES)("%s", (fixture) => {
  const dir = siteDir(fixture);
  const expectation = readExpectation(fixture);

  it("expected JSON matches the schema and names its fixture", () => {
    expect(expectation.fixture).toBe(fixture);
  });

  it("was written for the current ruleset version", () => {
    // Changing a rule changes results: bump RULESET_VERSION and update the expected JSON together.
    expect(expectation.rulesetVersion).toBe(RULESET_VERSION);
  });

  it("_fixture.json matches the fixture server schema", () => {
    expect(() => readFixtureServer(dir)).not.toThrow();
  });

  it("lists every failure once", () => {
    const keys = expectation.expectedFailures.map((f) => `${f.ruleId} ${f.url ?? "site"}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every failing URL is on this site and referenced by it", () => {
    const server = readFixtureServer(dir);
    const corpus = listFiles(dir)
      .filter((f) => /\.(html|xml|txt|json)$/.test(f))
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("\n");
    for (const failure of expectation.expectedFailures) {
      if (failure.url === null) continue;
      const url = new URL(failure.url);
      expect(url.origin).toBe(server.origin);
      expect(corpus.includes(failure.url) || corpus.includes(`"${url.pathname}"`)).toBe(true);
    }
  });
});

it("golden site has no expected failures and must score 100", () => {
  const golden = readExpectation("golden-site");
  expect(golden.expectedFailures).toEqual([]);
  expect(golden.changedFiles).toEqual([]);
  expect(golden.expectedScore).toBe(100);
});
