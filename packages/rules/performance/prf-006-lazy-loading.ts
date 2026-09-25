import { defineRule, fail, forPages, indexable, pass } from "../src/define";

export const PRF_006 = defineRule(
  {
    id: "PRF-006",
    category: "performance",
    severity: "low",
    title: "Images are not lazy-loaded correctly",
    passCondition:
      'Passes when the first image in <main> loads eagerly (it is often the largest paint) and every later image in <main> has loading="lazy".',
    appliesTo: "both",
    autoFixable: false,
    riskLevel: "low",
    effort: 1,
    explanation: {
      why: "Lazy-loading below-the-fold images saves bandwidth; lazy-loading the first image delays the largest paint.",
      fix: ['Add loading="lazy" to images further down the page.', 'Remove it from the first (hero) image and add fetchpriority="high".'],
    },
  },
  (site) =>
    forPages(site, indexable, (p) => {
      const images = (p.facts?.images ?? []).filter((i) => i.inMain);
      if (images.length === 0) return null;
      const problems: string[] = [];
      if (images[0]?.loading === "lazy") problems.push(`first image is lazy: ${images[0].src}`);
      for (const img of images.slice(1)) if (img.loading !== "lazy") problems.push(`not lazy: ${img.src}`);
      return problems.length ? fail(p.url, { problems }) : pass(p.url);
    }),
);
