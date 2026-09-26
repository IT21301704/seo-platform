import { defineRule, fail, na, pass } from "../src/define";

export const TEC_009 = defineRule(
  {
    id: "TEC-009",
    category: "technical",
    severity: "high",
    title: "Missing pages do not return a 404 status",
    passCondition:
      "Passes when a URL that does not exist returns HTTP 404 or 410 (not 200, and not a redirect).",
    appliesTo: "url",
    autoFixable: false,
    riskLevel: "medium",
    effort: 2,
    explanation: {
      why: "When missing pages return 200 ('soft 404'), search engines may index error pages and waste crawl time on URLs that do not exist.",
      fix: [
        "Configure the server or CMS to send status 404 with the 'page not found' template.",
        "Do not redirect every unknown URL to the home page.",
      ],
    },
  },
  (site) => {
    const probe = site.probes.notFound;
    if (!probe || probe.status === null) return [na(null, "404 probe did not respond")];
    const evidence = {
      probeUrl: probe.url,
      status: probe.status,
      redirected: probe.chain.length > 0,
    };
    const ok = (probe.status === 404 || probe.status === 410) && probe.chain.length === 0;
    return [ok ? pass(null, evidence) : fail(null, evidence)];
  },
);
