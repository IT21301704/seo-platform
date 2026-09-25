import { defineRule, fail, forPages, html200, pass } from "../src/define";

export const LNK_001 = defineRule(
  {
    id: "LNK-001",
    category: "links",
    severity: "low",
    title: "Links that search engines cannot follow",
    passCondition: 'Passes when no <a> tag uses an empty href, "#" or "javascript:".',
    appliesTo: "both",
    autoFixable: false,
    riskLevel: "low",
    effort: 2,
    explanation: {
      why: "Search engines only follow real URLs in href. Links that work only through JavaScript hide pages from crawlers.",
      fix: ["Give every link a real URL in its href.", "Use a <button> for actions that are not navigation."],
    },
  },
  (site) =>
    forPages(site, html200, (p) => {
      const bad = (p.facts?.links ?? [])
        .map((l) => l.href)
        .filter((href) => href === "" || href === "#" || /^javascript:/i.test(href));
      return bad.length ? fail(p.url, { hrefs: bad }) : pass(p.url);
    }),
);
