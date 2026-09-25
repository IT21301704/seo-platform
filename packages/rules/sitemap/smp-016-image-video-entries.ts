import { defineRule, fail, pass } from "../src/define";

export const SMP_016 = defineRule(
  {
    id: "SMP-016",
    category: "sitemap",
    scoreCategory: "indexing",
    severity: "low",
    title: "Invalid image or video sitemap entries",
    passCondition:
      "Passes when every image:loc is an absolute URL and every video entry has a thumbnail, a title and a content or player URL. Not applicable without image/video entries.",
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "high",
    effort: 1,
    explanation: {
      why: "Invalid image or video entries are ignored, so the media is less likely to appear in image and video search.",
      fix: ["Regenerate the sitemap with your plugin; fill in missing video titles and thumbnails."],
    },
  },
  (site) =>
    [...site.sitemapEntries.values()]
      .filter((e) => e.images.length + e.videos.length > 0)
      .map((e) => {
        const problems: string[] = [];
        for (const img of e.images) if (!/^https?:\/\//.test(img)) problems.push(`image not absolute: ${img}`);
        e.videos.forEach((v, i) => {
          if (!v.thumbnail) problems.push(`video ${i + 1}: missing thumbnail_loc`);
          if (!v.title) problems.push(`video ${i + 1}: missing title`);
          if (!v.contentLoc) problems.push(`video ${i + 1}: missing content_loc or player_loc`);
        });
        return problems.length ? fail(e.loc, { problems }) : pass(e.loc);
      }),
);
