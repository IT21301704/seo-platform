import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { ONP_006 } from "./onp-006-heading-order";

describe("ONP-006 heading order", () => {
  it("passes for H1 → H2 → H3", async () => {
    const pages = {
      ...defaultPages(),
      "/about/": page("/about/", { body: "<h2>Story</h2><h3>Kiln</h3><h2>Team</h2>" }),
    };
    expect(summary(await check(ONP_006, { pages }))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails for H1 → H3", async () => {
    const pages = { ...defaultPages(), "/about/": page("/about/", { body: "<h3>Skipped</h3>" }) };
    expect(summary(await check(ONP_006, { pages }))).toEqual(["pass /", "fail /about/"]);
  });
});
