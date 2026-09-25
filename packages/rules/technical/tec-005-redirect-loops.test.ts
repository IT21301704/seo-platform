import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { TEC_005 } from "./tec-005-redirect-loops";

const pages = { ...defaultPages(), "/": page("/", { nav: ["/about/", "/a/"] }) };

describe("TEC-005 redirect loops", () => {
  it("passes for a redirect that ends on a page", async () => {
    const outcomes = await check(TEC_005, { pages, server: { redirects: [{ from: "/a/", to: "/about/", status: 301 }] } });
    expect(summary(outcomes)).toEqual(["pass /a/"]);
  });

  it("fails for a loop", async () => {
    const outcomes = await check(TEC_005, {
      pages,
      server: {
        redirects: [
          { from: "/a/", to: "/b/", status: 301 },
          { from: "/b/", to: "/a/", status: 301 },
        ],
      },
    });
    expect(summary(outcomes)).toEqual(["fail /a/"]);
  });
});
