import { needsRender } from "@seo/crawler";
import { defineRule, fail, forPages, indexable, na, pass } from "../src/define";

/** Fail when the raw HTML has less than this share of the rendered text... */
const MIN_RAW_SHARE = 0.8;
/** ...and at least this many words are only visible after JavaScript. */
const MIN_MISSING_WORDS = 30;

export const AI_001 = defineRule(
  {
    id: "AI-001",
    category: "ai",
    severity: "high",
    title: "Key content only appears after JavaScript runs",
    passCondition: `Passes when the HTML as served already contains the page's main content (at least ${MIN_RAW_SHARE * 100}% of the words visible after rendering).`,
    appliesTo: "url",
    autoFixable: false,
    riskLevel: "medium",
    confidence: 0.8,
    effort: 4,
    explanation: {
      why: "Many AI crawlers (GPTBot, ClaudeBot, PerplexityBot) do not run JavaScript, and Google renders it later. Content injected by scripts may be invisible to them.",
      fix: [
        "Render this content on the server (server-side rendering or static generation).",
        "If it comes from a widget or plugin, choose one that outputs HTML.",
      ],
    },
  },
  (site) =>
    forPages(site, indexable, (p) => {
      if (!p.raw) return null;
      if (!p.rendered) {
        return p.record.rawHtml && needsRender(p.record.rawHtml)
          ? na(p.url, "Page needed rendering but was over the render budget")
          : pass(p.url, { rendered: false });
      }
      const raw = p.raw.wordCount;
      const rendered = p.rendered.wordCount;
      const evidence = { rawWords: raw, renderedWords: rendered };
      const missing = rendered - raw;
      return rendered > 0 && raw / rendered < MIN_RAW_SHARE && missing >= MIN_MISSING_WORDS
        ? fail(p.url, evidence)
        : pass(p.url, evidence);
    }),
);
