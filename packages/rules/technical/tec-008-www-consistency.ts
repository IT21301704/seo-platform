import { defineRule, fail, na, pass } from "../src/define";

export const TEC_008 = defineRule(
  {
    id: "TEC-008",
    category: "technical",
    severity: "medium",
    title: "www and non-www versions both serve the site",
    passCondition:
      "Passes when the other host version (www. or without www.) redirects to your main address, or does not exist.",
    appliesTo: "url",
    autoFixable: false,
    riskLevel: "high",
    effort: 2,
    explanation: {
      why: "If both example.com and www.example.com show the site, search engines see two copies of every page and split signals between them.",
      fix: ["Pick one host as the main address.", "301-redirect the other host to it at your DNS/host/CDN."],
    },
  },
  (site) => {
    const { protocol, host } = new URL(site.origin);
    const other = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
    const url = `${protocol}//${other}/`;
    const probe = site.probes.alternateOrigins.find((p) => p.url === url);
    if (!probe || probe.status === null) return [na(url, "Other host version does not exist")];
    const target = probe.chain[0]?.location ?? null;
    const evidence = { status: probe.status, location: target };
    const redirectsHome = probe.status >= 300 && probe.status < 400 && target !== null && new URL(target).host === host;
    return [redirectsHome ? pass(url, evidence) : fail(url, evidence)];
  },
);
