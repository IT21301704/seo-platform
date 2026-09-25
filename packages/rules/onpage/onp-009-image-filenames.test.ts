import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { ONP_009, isDescriptiveFilename } from "./onp-009-image-filenames";

describe("ONP-009 image filenames", () => {
  it.each(["/images/blue-ceramic-mug.webp", "/uploads/2026/09/gift-set.jpg", "data:image/png;base64,AAA"])(
    "accepts %s",
    (src) => expect(isDescriptiveFilename(src)).toBe(true),
  );
  it.each(["/IMG_1234.jpg", "/DSC0042.JPG", "/1234567.png", "/3f2a9b7c1d4e5f60.webp", "/image.png"])(
    "rejects %s",
    (src) => expect(isDescriptiveFilename(src)).toBe(false),
  );

  it("passes and fails pages", async () => {
    const good = { ...defaultPages(), "/about/": page("/about/", { body: '<img src="/images/studio-kiln.svg" alt="Kiln">' }) };
    expect(summary(await check(ONP_009, { pages: good }))).toEqual(["pass /about/"]);
    const bad = { ...defaultPages(), "/about/": page("/about/", { body: '<img src="/images/IMG_0042.jpg" alt="Kiln">' }) };
    expect(summary(await check(ONP_009, { pages: bad }))).toEqual(["fail /about/"]);
  });
});
