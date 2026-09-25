import { defineRule, fail, forPages, indexable, pass } from "../src/define";

export const PRF_007 = defineRule(
  {
    id: "PRF-007",
    category: "performance",
    severity: "medium",
    title: "Render-blocking scripts in <head>",
    passCondition: "Passes when every external script in <head> uses async, defer or type=\"module\".",
    appliesTo: "both",
    autoFixable: false,
    riskLevel: "medium",
    effort: 2,
    explanation: {
      why: "A plain <script src> in the head stops the browser from showing anything until the script downloads and runs.",
      fix: ["Add defer (or async for independent scripts) to scripts in the head.", "Move non-critical scripts to the end of the body."],
    },
  },
  (site) =>
    forPages(site, indexable, (p) => {
      const blocking = (p.facts?.scripts ?? [])
        .filter((s) => s.inHead && s.src && !s.async && !s.defer && s.type !== "module")
        .map((s) => s.src ?? "");
      return blocking.length ? fail(p.url, { scripts: blocking }) : pass(p.url);
    }),
);
