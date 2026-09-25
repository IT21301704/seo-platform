import { describe, expect, it } from "vitest";
import { ORIGIN, check, defaultPages, page, summary } from "../src/testing";
import { IDX_002 } from "./idx-002-canonical-valid";

describe("IDX-002 canonical valid", () => {
  it("passes for self-referencing canonicals", async () => {
    expect(summary(await check(IDX_002))).toEqual(["pass /", "pass /about/"]);
  });

  it("passes for a canonical to another valid page", async () => {
    const pages = { ...defaultPages(), "/about/": page("/about/", { canonical: `${ORIGIN}/` }) };
    expect(summary(await check(IDX_002, { pages }))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails for a canonical that returns 404", async () => {
    const pages = { ...defaultPages(), "/about/": page("/about/", { canonical: `${ORIGIN}/gone/` }) };
    const outcomes = await check(IDX_002, { pages });
    expect(summary(outcomes)).toEqual(["pass /", "fail /about/"]);
    expect(outcomes[1]?.evidence["problem"]).toBe("target returns 404");
  });
});
