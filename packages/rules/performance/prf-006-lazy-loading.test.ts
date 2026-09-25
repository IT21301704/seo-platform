import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { PRF_006 } from "./prf-006-lazy-loading";

const withImages = (body: string) => ({ pages: { ...defaultPages(), "/about/": page("/about/", { body }) } });

describe("PRF-006 lazy loading", () => {
  it("passes for an eager hero and lazy later images", async () => {
    const body = '<img src="/hero-mug.svg" alt="Hero" fetchpriority="high"><img src="/detail-shot.svg" alt="Detail" loading="lazy">';
    expect(summary(await check(PRF_006, withImages(body)))).toEqual(["pass /about/"]);
  });

  it("fails for a lazy hero and an eager later image", async () => {
    const body = '<img src="/hero-mug.svg" alt="Hero" loading="lazy"><img src="/detail-shot.svg" alt="Detail">';
    const outcomes = await check(PRF_006, withImages(body));
    expect(summary(outcomes)).toEqual(["fail /about/"]);
    expect(outcomes[0]?.evidence["problems"]).toHaveLength(2);
  });
});
