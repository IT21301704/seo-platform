import { defineRule, fail, pass } from "../src/define";

export const SMP_003 = defineRule(
  {
    id: "SMP-003",
    category: "sitemap",
    scoreCategory: "technical",
    severity: "high",
    title: "Sitemap is not submitted in Search Console",
    passCondition:
      "Passes when every sitemap we found (or the sitemap index that lists it) is submitted in Search Console. Not applicable without a Search Console connection.",
    appliesTo: "url",
    autoFixable: true,
    riskLevel: "high",
    effort: 1,
    explanation: {
      why: "Submitting the sitemap in Search Console lets Google report how many of its URLs it could read and index, and speeds up discovery.",
      fix: ["Submit the sitemap in Search Console (Indexing → Sitemaps).", "Auto-fix will submit it through the API once approvals arrive (Phase 3)."],
    },
  },
  (site) => {
    if (!site.gsc) return [];
    const submitted = new Set(site.gsc.sitemaps.map((s) => s.path));
    // A child listed in a submitted index counts as submitted.
    const coveredByIndex = new Set(
      site.sitemaps
        .filter((s) => submitted.has(s.record.url) && s.parsed?.kind === "sitemapindex")
        .flatMap((s) => s.parsed?.children ?? []),
    );
    return site.sitemaps
      .filter((s) => s.record.status === 200)
      .map(({ record }) =>
        submitted.has(record.url) || coveredByIndex.has(record.url)
          ? pass(record.url)
          : fail(record.url, { submittedSitemaps: [...submitted].sort() }),
      );
  },
);
