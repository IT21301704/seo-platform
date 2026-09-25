import { defineRule, fail, forPages, indexable, pass } from "../src/define";
import { nodesOfType, str } from "../src/helpers";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;

export const SD_008 = defineRule(
  {
    id: "SD-008",
    category: "schema",
    severity: "medium",
    title: "Article structured data is incomplete",
    passCondition:
      "Passes when every Article/BlogPosting has a headline (max 110 characters), an ISO datePublished, an author and an image.",
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "high",
    effort: 1,
    explanation: {
      why: "Complete article markup helps search engines show the date, author and image, and signals who wrote the content.",
      fix: ["Fill in author and featured image for each post; your SEO plugin then outputs the markup."],
    },
  },
  (site) =>
    forPages(site, indexable, (p) => {
      const articles = p.facts ? nodesOfType(p.facts, "Article") : null;
      if (!articles?.length) return null;
      const problems = new Set<string>();
      for (const a of articles) {
        const headline = str(a["headline"]);
        if (!headline) problems.add("headline");
        else if (headline.length > 110) problems.add("headline longer than 110 characters");
        const published = str(a["datePublished"]);
        if (!published || !ISO_DATE.test(published)) problems.add("datePublished");
        if (!a["author"]) problems.add("author");
        if (!a["image"]) problems.add("image");
      }
      return problems.size ? fail(p.url, { problems: [...problems].sort() }) : pass(p.url);
    }),
);
