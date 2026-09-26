import { describe, expect, it } from "vitest";
import { ORIGIN, check, sitemapXml, summary } from "../src/testing";
import { SMP_016 } from "./smp-016-image-video-entries";

describe("SMP-016 image/video sitemap entries", () => {
  it("passes for absolute image URLs", async () => {
    const xml = sitemapXml([
      {
        path: "/",
        extra: `<image:image><image:loc>${ORIGIN}/images/mug.webp</image:loc></image:image>`,
      },
    ]);
    expect(summary(await check(SMP_016, { files: { "/sitemap.xml": xml } }))).toEqual(["pass /"]);
  });

  it("fails for a video without a title", async () => {
    const video = `<video:video><video:thumbnail_loc>${ORIGIN}/t.jpg</video:thumbnail_loc><video:content_loc>${ORIGIN}/v.mp4</video:content_loc></video:video>`;
    const xml = sitemapXml([{ path: "/", extra: video }]);
    expect(summary(await check(SMP_016, { files: { "/sitemap.xml": xml } }))).toEqual(["fail /"]);
  });

  it("is not applicable without media entries", async () => {
    expect(summary(await check(SMP_016))).toEqual(["na site"]);
  });
});
