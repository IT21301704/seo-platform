import { describe, expect, it } from "vitest";
import { ORIGIN, check, page, summary } from "../src/testing";
import { IDX_006 } from "./idx-006-hreflang";

const alt = (lang: string, path: string) =>
  `<link rel="alternate" hreflang="${lang}" href="${ORIGIN}${path}">`;

describe("IDX-006 hreflang", () => {
  it("passes for reciprocal hreflang pairs", async () => {
    const head = alt("en", "/") + alt("si", "/si/");
    const pages = { "/": page("/", { nav: ["/si/"], head }), "/si/": page("/si/", { head }) };
    expect(summary(await check(IDX_006, { pages }))).toEqual(["pass /", "pass /si/"]);
  });

  it("fails without return links and with invalid codes", async () => {
    const pages = {
      "/": page("/", { nav: ["/si/"], head: alt("en", "/") + alt("sinhala", "/si/") }),
      "/si/": page("/si/"),
    };
    const outcomes = await check(IDX_006, { pages });
    expect(summary(outcomes)).toEqual(["fail /"]);
    expect(outcomes[0]?.evidence["problems"]).toEqual([
      'invalid code "sinhala"',
      `no return link from ${ORIGIN}/si/`,
    ]);
  });

  it("is not applicable without hreflang", async () => {
    expect(summary(await check(IDX_006))).toEqual(["na site"]);
  });
});
