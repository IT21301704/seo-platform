import { describe, expect, it } from "vitest";
import { DEFAULT_ROBOTS, check, summary } from "../src/testing";
import { SMP_009 } from "./smp-009-no-robots-blocked";

describe("SMP-009 no robots-blocked URLs in sitemap", () => {
  it("passes when every URL is crawlable", async () => {
    expect(summary(await check(SMP_009))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails for a blocked URL", async () => {
    const robots = DEFAULT_ROBOTS.replace("Allow: /", "Allow: /\nDisallow: /about/");
    expect(summary(await check(SMP_009, { files: { "/robots.txt": robots } }))).toEqual(["pass /", "fail /about/"]);
  });
});
