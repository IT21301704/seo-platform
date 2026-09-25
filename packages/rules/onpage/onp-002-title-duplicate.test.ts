import { describe, expect, it } from "vitest";
import { check, page, summary } from "../src/testing";
import { ONP_002 } from "./onp-002-title-duplicate";

describe("ONP-002 duplicate titles", () => {
  it("passes for unique titles", async () => {
    expect(summary(await check(ONP_002))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails for both pages sharing a title", async () => {
    const title = "Handmade mugs from our studio | Example Store";
    const pages = {
      "/": page("/", { nav: ["/a/", "/b/"] }),
      "/a/": page("/a/", { title }),
      "/b/": page("/b/", { title }),
    };
    expect(summary(await check(ONP_002, { pages }))).toEqual(["pass /", "fail /a/", "fail /b/"]);
  });
});
