import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { LNK_001 } from "./lnk-001-crawlable-links";

describe("LNK-001 crawlable links", () => {
  it("passes for real hrefs and in-page anchors", async () => {
    const pages = {
      ...defaultPages(),
      "/about/": page("/about/", { body: '<p><a href="#team">Team</a></p>' }),
    };
    expect(summary(await check(LNK_001, { pages }))).toEqual(["pass /", "pass /about/"]);
  });

  it("fails for javascript: and # links", async () => {
    const body = '<p><a href="javascript:void(0)">Open</a> <a href="#">Top</a></p>';
    const pages = { ...defaultPages(), "/about/": page("/about/", { body }) };
    expect(summary(await check(LNK_001, { pages }))).toEqual(["pass /", "fail /about/"]);
  });
});
