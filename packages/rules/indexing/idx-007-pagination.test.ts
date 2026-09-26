import { describe, expect, it } from "vitest";
import { ORIGIN, check, page, summary } from "../src/testing";
import { IDX_007 } from "./idx-007-pagination";

describe("IDX-007 pagination", () => {
  it("passes when page 2 is self-canonical", async () => {
    const pages = {
      "/": page("/", { nav: ["/blog/page/2/"] }),
      "/blog/page/2/": page("/blog/page/2/"),
    };
    expect(summary(await check(IDX_007, { pages }))).toEqual(["pass /blog/page/2/"]);
  });

  it("fails when page 2 canonicalises to page 1", async () => {
    const pages = {
      "/": page("/", { nav: ["/blog/page/2/"] }),
      "/blog/page/2/": page("/blog/page/2/", { canonical: `${ORIGIN}/` }),
    };
    expect(summary(await check(IDX_007, { pages }))).toEqual(["fail /blog/page/2/"]);
  });

  it("is not applicable without pagination", async () => {
    expect(summary(await check(IDX_007))).toEqual(["na site"]);
  });
});
