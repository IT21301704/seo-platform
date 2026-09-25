import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GOLDEN_DIR, brokenSiteNames, listFiles, readExpectation, siteDir } from "./helpers";

/** Files that are new or differ byte-for-byte from the golden site. */
function diffAgainstGolden(dir: string): string[] {
  const golden = new Set(listFiles(GOLDEN_DIR));
  return listFiles(dir).filter(
    (f) => !golden.has(f) || !readFileSync(join(dir, f)).equals(readFileSync(join(GOLDEN_DIR, f))),
  );
}

describe.each(brokenSiteNames())("%s", (fixture) => {
  it("differs from the golden site only in its declared changedFiles", () => {
    const expectation = readExpectation(fixture);
    expect(diffAgainstGolden(siteDir(fixture))).toEqual([...expectation.changedFiles].sort());
  });

  it("keeps every golden file (faults are edits, not deletions)", () => {
    const files = new Set(listFiles(siteDir(fixture)));
    for (const f of listFiles(GOLDEN_DIR)) expect(files.has(f), f).toBe(true);
  });
});
