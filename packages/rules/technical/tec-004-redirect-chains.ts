import { defineRule, fail, pass } from "../src/define";

export const TEC_004 = defineRule(
  {
    id: "TEC-004",
    category: "technical",
    severity: "medium",
    title: "Redirect chains longer than one hop",
    passCondition: "Passes when every redirecting URL reaches its final page in a single redirect.",
    appliesTo: "url",
    autoFixable: true,
    riskLevel: "high",
    effort: 2,
    explanation: {
      why: "Each extra redirect slows the page down and wastes crawl budget; long chains may not be followed to the end.",
      fix: [
        "Point the first URL straight at the final URL.",
        "Update internal links to use the final URL so no redirect is needed.",
      ],
    },
  },
  (site) =>
    site.pages
      .filter((p) => p.record.chain.length > 0 && !p.record.loop)
      .map(({ url, record }) => {
        const hops = record.chain.map((h) => h.url);
        const evidence = { hops: record.chain.length, chain: [...hops, record.finalUrl] };
        return record.chain.length > 1 ? fail(url, evidence) : pass(url, evidence);
      }),
);
