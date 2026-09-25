import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { PRF_005 } from "./prf-005-image-weight";

const pages = { ...defaultPages(), "/about/": page("/about/", { body: '<img src="/images/studio-photo.png" alt="Studio">' }) };

describe("PRF-005 image weight", () => {
  it("passes for a small PNG", async () => {
    const outcomes = await check(PRF_005, { pages, files: { "/images/studio-photo.png": Buffer.alloc(20 * 1024) } });
    expect(summary(outcomes)).toEqual(["pass /about/"]);
  });

  it("fails for a 150 KB PNG", async () => {
    const outcomes = await check(PRF_005, { pages, files: { "/images/studio-photo.png": Buffer.alloc(150 * 1024) } });
    expect(summary(outcomes)).toEqual(["fail /about/"]);
  });
});
