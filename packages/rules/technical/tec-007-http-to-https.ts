import { defineRule, fail, na, pass } from "../src/define";

const PERMANENT = new Set([301, 308]);

export const TEC_007 = defineRule(
  {
    id: "TEC-007",
    category: "technical",
    severity: "high",
    title: "HTTP does not redirect to HTTPS",
    passCondition: "Passes when http://<your domain>/ permanently redirects (301/308) to the https:// site.",
    appliesTo: "url",
    autoFixable: false,
    riskLevel: "high",
    effort: 2,
    explanation: {
      why: "Without the redirect, the http:// and https:// versions compete as duplicates and visitors can land on the insecure version.",
      fix: [
        "Enable 'force HTTPS' in your host or CDN settings.",
        "Use a 301 redirect, not 302, so search engines treat it as permanent.",
      ],
    },
  },
  (site) => {
    if (!site.origin.startsWith("https://")) return [na(null, "Site is not on HTTPS (see TEC-006)")];
    const httpUrl = `${site.origin.replace("https://", "http://")}/`;
    const probe = site.probes.alternateOrigins.find((p) => p.url === httpUrl);
    if (!probe || probe.status === null) return [na(httpUrl, "http:// version did not respond")];
    const target = probe.chain[0]?.location ?? null;
    const ok = PERMANENT.has(probe.status) && target !== null && target.startsWith("https://");
    const evidence = { status: probe.status, location: target };
    return [ok ? pass(httpUrl, evidence) : fail(httpUrl, evidence)];
  },
);
