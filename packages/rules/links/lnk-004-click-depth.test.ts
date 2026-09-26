import { describe, expect, it } from "vitest";
import { check, page, summary } from "../src/testing";
import { LNK_004 } from "./lnk-004-click-depth";

function chain(length: number): Record<string, string> {
  const paths = ["/", ...Array.from({ length }, (_, i) => `/level-${i + 1}/`)];
  return Object.fromEntries(
    paths.map((path, i) => [
      path,
      page(path, {
        nav: [],
        body: paths[i + 1] ? `<p><a href="${paths[i + 1]}">Next</a></p>` : "<p>End</p>",
      }),
    ]),
  );
}

describe("LNK-004 click depth", () => {
  it("passes when pages are 3 clicks deep or less", async () => {
    const outcomes = await check(LNK_004, { pages: chain(3) });
    expect(outcomes.every((o) => o.result === "pass")).toBe(true);
  });

  it("fails for a page 4 clicks deep", async () => {
    const outcomes = await check(LNK_004, { pages: chain(4) });
    expect(summary(outcomes).filter((s) => s.startsWith("fail"))).toEqual(["fail /level-4/"]);
  });
});
