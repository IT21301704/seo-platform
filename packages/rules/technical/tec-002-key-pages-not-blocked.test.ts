import { describe, expect, it } from "vitest";
import { check, summary } from "../src/testing";
import { TEC_002 } from "./tec-002-key-pages-not-blocked";

describe("TEC-002 important pages not blocked", () => {
  it("passes when robots.txt allows everything", async () => {
    expect(summary(await check(TEC_002))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails for important pages Googlebot may not crawl", async () => {
    const robots = "User-agent: Googlebot\nDisallow: /about/\n\nUser-agent: *\nAllow: /\n";
    expect(summary(await check(TEC_002, { files: { "/robots.txt": robots } }))).toEqual([
      "pass /",
      "fail /about/",
    ]);
  });
});
