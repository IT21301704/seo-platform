import { defineRule, fail, forPages, indexable, pass } from "../src/define";

export const MAX_IMAGE_BYTES = 200 * 1024;
export const MAX_LEGACY_IMAGE_BYTES = 100 * 1024;
const LEGACY = /image\/(jpeg|png|gif)/i;

export const PRF_005 = defineRule(
  {
    id: "PRF-005",
    category: "performance",
    severity: "medium",
    title: "Images are too large or use old formats",
    passCondition: `Passes when every image on the page is at most ${MAX_IMAGE_BYTES / 1024} KB, and JPEG/PNG/GIF images at most ${MAX_LEGACY_IMAGE_BYTES / 1024} KB (larger ones should be WebP or AVIF).`,
    appliesTo: "url",
    autoFixable: false,
    riskLevel: "low",
    effort: 2,
    explanation: {
      why: "Images are usually the heaviest part of a page. Oversized images slow down loading, especially on mobile data.",
      fix: ["Resize images to the size they are displayed at.", "Convert photos to WebP or AVIF (many CMS plugins do this automatically)."],
    },
  },
  (site) =>
    forPages(site, indexable, (p) => {
      const checked = [...new Set((p.facts?.images ?? []).map((i) => i.url).filter((u): u is string => u !== null))]
        .map((u) => site.images.get(u))
        .filter((r) => r !== undefined && r.status === 200 && r.bodySize > 0);
      if (checked.length === 0) return null;
      const heavy = checked
        .filter((r) => r !== undefined)
        .filter((r) => r.bodySize > MAX_IMAGE_BYTES || (LEGACY.test(r.contentType ?? "") && r.bodySize > MAX_LEGACY_IMAGE_BYTES))
        .map((r) => ({ url: r.url, bytes: r.bodySize, type: r.contentType }));
      return heavy.length ? fail(p.url, { images: heavy }) : pass(p.url, { images: checked.length });
    }),
);
