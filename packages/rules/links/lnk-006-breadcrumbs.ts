import { defineRule, fail, forPages, pass } from "../src/define";
import { nodesOfType } from "../src/helpers";

export const LNK_006 = defineRule(
  {
    id: "LNK-006",
    category: "links",
    severity: "low",
    title: "Pages without breadcrumbs",
    passCondition:
      "Passes when every indexable page except the home page has breadcrumb navigation or BreadcrumbList structured data.",
    appliesTo: "both",
    autoFixable: false,
    riskLevel: "low",
    effort: 2,
    explanation: {
      why: "Breadcrumbs show visitors and search engines where a page sits in the site, and Google can show them in results instead of the raw URL.",
      fix: [
        "Turn on breadcrumbs in your theme or SEO plugin.",
        "Add BreadcrumbList structured data that matches them.",
      ],
    },
  },
  (site) =>
    forPages(
      site,
      (p) => p.isIndexable && p.url !== site.rootUrl,
      (p) => {
        const hasSchema =
          (p.facts && (nodesOfType(p.facts, "BreadcrumbList") ?? []).length > 0) ?? false;
        return p.facts?.hasBreadcrumbNav || hasSchema ? pass(p.url) : fail(p.url);
      },
    ),
);
