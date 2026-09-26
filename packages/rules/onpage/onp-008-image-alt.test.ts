import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { ONP_008 } from "./onp-008-image-alt";

describe("ONP-008 image alt", () => {
  it("passes when images have alt text (or empty alt for decoration)", async () => {
    const body =
      '<img src="/images/blue-mug.svg" alt="Blue mug"><img src="/images/divider-line.svg" alt="">';
    const pages = { ...defaultPages(), "/about/": page("/about/", { body }) };
    expect(summary(await check(ONP_008, { pages }))).toEqual(["pass /about/"]);
  });

  it("fails for an image without an alt attribute", async () => {
    const pages = {
      ...defaultPages(),
      "/about/": page("/about/", { body: '<img src="/images/blue-mug.svg">' }),
    };
    expect(summary(await check(ONP_008, { pages }))).toEqual(["fail /about/"]);
  });
});
