import { defineRule, fail, pass } from "../src/define";

export const SMP_004 = defineRule(
  {
    id: "SMP-004",
    category: "sitemap",
    scoreCategory: "technical",
    severity: "critical",
    title: "Sitemap is not valid XML",
    passCondition:
      "Passes when each sitemap is well-formed UTF-8 XML (valid gzip if compressed) with a <urlset> or <sitemapindex> root in the sitemaps.org namespace and a <loc> in every entry.",
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "high",
    effort: 1,
    explanation: {
      why: "Search engines reject a sitemap that is not valid, so none of its URLs are used.",
      fix: [
        "Regenerate the sitemap with your CMS or plugin instead of editing it by hand.",
        "Check that nothing (e.g. a PHP warning) is printed before the XML.",
      ],
    },
  },
  (site) =>
    site.sitemaps
      .filter((s) => s.record.status === 200)
      .map(({ record, parsed }) => {
        const problems: string[] = [];
        if (record.decodeError) problems.push(record.decodeError);
        if (parsed) problems.push(...parsed.errors);
        const declared = /<\?xml[^>]*encoding=["']([^"']+)["']/i.exec(record.body ?? "")?.[1];
        if (declared && declared.toLowerCase() !== "utf-8")
          problems.push(`encoding is ${declared}, not UTF-8`);
        return problems.length
          ? fail(record.url, { problems })
          : pass(record.url, { kind: parsed?.kind ?? null });
      }),
);
