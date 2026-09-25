import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { brokenSiteNames, hashSite, listFiles, siteDir } from "./helpers";

const ALL_FIXTURES = ["golden-site", ...brokenSiteNames()];
const RUNS = 10;
const TEXT_FILE = /\.(html|xml|txt|json|css|js|svg)$/;

describe.each(ALL_FIXTURES)("%s", (fixture) => {
  const dir = siteDir(fixture);

  it(`content hash is identical across ${RUNS} reads`, () => {
    const hashes = new Set(Array.from({ length: RUNS }, () => hashSite(dir)));
    expect(hashes.size).toBe(1);
  });

  it("text files use LF line endings and no BOM (hashes must match on every OS)", () => {
    for (const file of listFiles(dir).filter((f) => TEXT_FILE.test(f))) {
      const bytes = readFileSync(join(dir, file));
      expect(bytes.includes(0x0d), `${file} contains CR`).toBe(false);
      expect(bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), `${file} has BOM`).toBe(
        false,
      );
    }
  });
});

it("every fixture has a distinct content hash", () => {
  const hashes = ALL_FIXTURES.map((f) => hashSite(siteDir(f)));
  expect(new Set(hashes).size).toBe(ALL_FIXTURES.length);
});
