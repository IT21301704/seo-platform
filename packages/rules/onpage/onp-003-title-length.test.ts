import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { ONP_003 } from "./onp-003-title-length";

describe("ONP-003 title length", () => {
  it("passes for 30–60 character titles", async () => {
    expect(summary(await check(ONP_003))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails for a 5-character title", async () => {
    const pages = { ...defaultPages(), "/about/": page("/about/", { title: "About" }) };
    const outcomes = await check(ONP_003, { pages });
    expect(summary(outcomes)).toEqual(["pass /", "fail /about/"]);
    expect(outcomes[1]?.evidence["length"]).toBe(5);
  });
});
