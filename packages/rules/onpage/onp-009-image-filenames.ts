import { defineRule, fail, forPages, indexable, pass } from "../src/define";

const CAMERA_NAME =
  /^(img|image|dsc|dscn|dcim|pic|photo|picture|screenshot|screen-shot|untitled|file|scan|pxl)[-_ ]?\d*$/i;
const HASH_LIKE = /^[a-f0-9-]{16,}$/i;

export function isDescriptiveFilename(src: string): boolean {
  if (src.startsWith("data:")) return true;
  const name = decodeURIComponent(src.split(/[?#]/)[0]?.split("/").pop() ?? "").replace(
    /\.[a-z0-9]+$/i,
    "",
  );
  if (name === "" || /^\d+$/.test(name) || CAMERA_NAME.test(name) || HASH_LIKE.test(name))
    return false;
  return /[a-z]{3,}/i.test(name);
}

export const ONP_009 = defineRule(
  {
    id: "ONP-009",
    category: "onpage",
    severity: "low",
    title: "Images with non-descriptive file names",
    passCondition:
      'Passes when image file names contain words (e.g. "blue-ceramic-mug.webp"), not camera or random names like "IMG_1234.jpg".',
    appliesTo: "both",
    autoFixable: false,
    riskLevel: "low",
    confidence: 0.7,
    effort: 2,
    explanation: {
      why: "Descriptive file names are a small extra clue for image search about what the picture shows.",
      fix: [
        "Rename images before uploading, using a few hyphen-separated words that describe them.",
      ],
    },
  },
  (site) =>
    forPages(site, indexable, (p) => {
      const images = p.facts?.images ?? [];
      if (images.length === 0) return null;
      const bad = images
        .map((i) => i.src)
        .filter((src) => src !== "" && !isDescriptiveFilename(src));
      return bad.length ? fail(p.url, { files: [...new Set(bad)] }) : pass(p.url);
    }),
);
