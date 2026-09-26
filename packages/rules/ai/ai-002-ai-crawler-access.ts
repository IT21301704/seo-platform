import { AI_CRAWLERS } from "@seo/crawler";
import { defineRule, fail, pass } from "../src/define";

export const AI_002 = defineRule(
  {
    id: "AI-002",
    category: "ai",
    severity: "high",
    title: "robots.txt rules for AI crawlers do not match your choice",
    passCondition: `Passes when robots.txt allows (or blocks) ${AI_CRAWLERS.join(", ")} as the site owner chose in the project settings.`,
    appliesTo: "both",
    autoFixable: true,
    riskLevel: "high",
    effort: 1,
    explanation: {
      why: "AI assistants can only read and cite pages their crawler may fetch. A leftover or plugin-added Disallow can silently remove the site from AI answers — or allow crawling you did not want.",
      fix: [
        "Edit the User-agent groups for these bots in robots.txt (or your SEO plugin's crawler settings).",
        "Change the choice in project settings if you want the opposite.",
      ],
    },
  },
  (site) => {
    const allowed = AI_CRAWLERS.filter((bot) => site.robots.parsed.isAllowed(site.rootUrl, bot));
    const blocked = AI_CRAWLERS.filter((bot) => !allowed.includes(bot));
    const intent = site.ownerIntent.aiCrawlers;
    const wrong = intent === "allow" ? blocked : allowed;
    const evidence = { intent, allowed: [...allowed], blocked: [...blocked] };
    return [
      wrong.length ? fail(null, { ...evidence, mismatched: [...wrong] }) : pass(null, evidence),
    ];
  },
);
