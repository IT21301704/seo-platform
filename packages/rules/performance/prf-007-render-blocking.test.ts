import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { PRF_007 } from "./prf-007-render-blocking";

describe("PRF-007 render-blocking scripts", () => {
  it("passes for deferred scripts", async () => {
    const pages = {
      ...defaultPages(),
      "/about/": page("/about/", { head: '<script src="/app.js" defer></script>' }),
    };
    expect(summary(await check(PRF_007, { pages }))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails for a blocking script in the head", async () => {
    const pages = {
      ...defaultPages(),
      "/about/": page("/about/", { head: '<script src="/app.js"></script>' }),
    };
    expect(summary(await check(PRF_007, { pages }))).toEqual(["pass /", "fail /about/"]);
  });
});
