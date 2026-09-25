import { describe, expect, it } from "vitest";
import { defaultPages, page, check, summary } from "../src/testing";
import { TEC_004 } from "./tec-004-redirect-chains";

const pages = { ...defaultPages(), "/": page("/", { nav: ["/about/", "/old/"] }) };

describe("TEC-004 redirect chains", () => {
  it("passes for a single redirect", async () => {
    const outcomes = await check(TEC_004, {
      pages,
      server: { redirects: [{ from: "/old/", to: "/about/", status: 301 }] },
    });
    expect(summary(outcomes)).toEqual(["pass /old/"]);
  });

  it("fails for two hops", async () => {
    const outcomes = await check(TEC_004, {
      pages,
      server: {
        redirects: [
          { from: "/old/", to: "/older/", status: 301 },
          { from: "/older/", to: "/about/", status: 301 },
        ],
      },
    });
    expect(summary(outcomes)).toEqual(["fail /old/"]);
    expect(outcomes[0]?.evidence["hops"]).toBe(2);
  });

  it("is not applicable without redirects", async () => {
    expect(summary(await check(TEC_004))).toEqual(["na site"]);
  });
});
