import { defineRule, fail, pass } from "../src/define";

export const TEC_006 = defineRule(
  {
    id: "TEC-006",
    category: "technical",
    severity: "critical",
    title: "Site is not served over HTTPS with a valid certificate",
    passCondition:
      "Passes when the site's address uses https:// and the home page loads without a TLS error.",
    appliesTo: "url",
    autoFixable: false,
    riskLevel: "high",
    effort: 3,
    explanation: {
      why: "Browsers mark HTTP pages as not secure and Google uses HTTPS as a ranking signal. An invalid certificate blocks visitors completely.",
      fix: [
        "Install a certificate (most hosts offer free Let's Encrypt certificates).",
        "Set the site address in your CMS to https://.",
      ],
    },
  },
  (site) => {
    const home = site.pageByUrl.get(site.rootUrl);
    if (!site.origin.startsWith("https://"))
      return [fail(site.rootUrl, { reason: "Site address uses http://" })];
    if (!home || home.record.status === null) {
      return [
        fail(site.rootUrl, {
          reason: "Home page did not load over HTTPS",
          error: home?.record.error ?? null,
        }),
      ];
    }
    return [pass(site.rootUrl)];
  },
);
