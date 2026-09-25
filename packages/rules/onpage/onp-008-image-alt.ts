import { defineRule, fail, forPages, indexable, pass } from "../src/define";

export const ONP_008 = defineRule(
  {
    id: "ONP-008",
    category: "onpage",
    severity: "medium",
    title: "Images without alt text",
    passCondition: 'Passes when every <img> has an alt attribute (alt="" is allowed for decorative images).',
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "low",
    effort: 1,
    explanation: {
      why: "Alt text describes images to screen-reader users and to search engines, which cannot see the picture.",
      fix: ["Describe what the image shows in a short phrase.", "Set it in your media library so every use of the image gets it."],
    },
  },
  (site) =>
    forPages(site, indexable, (p) => {
      const images = p.facts?.images ?? [];
      if (images.length === 0) return null;
      const missing = images.filter((i) => i.alt === null).map((i) => i.src);
      return missing.length ? fail(p.url, { imagesWithoutAlt: missing }) : pass(p.url, { images: images.length });
    }),
);
