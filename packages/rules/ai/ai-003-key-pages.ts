import type { SitePage } from "@seo/crawler";
import { defineRule, fail, pass } from "../src/define";

const KEY_PAGES: { name: string; path: RegExp; heading: RegExp }[] = [
  { name: "About", path: /\/(about|about-us|our-story|who-we-are)\/?/i, heading: /\babout\b|our story/i },
  { name: "Contact", path: /\/(contact|contact-us)\/?/i, heading: /\bcontact\b/i },
  { name: "FAQ", path: /\/(faq|faqs|help|questions)\/?/i, heading: /\bfaq|frequently asked/i },
  {
    name: "Services or Pricing",
    path: /\/(services?|pricing|prices|plans|what-we-do)\/?/i,
    heading: /\bservices?\b|\bpric(ing|es)\b/i,
  },
  {
    name: "Policies",
    path: /\/(privacy|terms|shipping|returns|refund|policies|policy)/i,
    heading: /privacy|terms|shipping|returns|refund|polic(y|ies)/i,
  },
];

function matches(page: SitePage, key: (typeof KEY_PAGES)[number]): boolean {
  const path = new URL(page.url).pathname;
  const h1 = page.facts?.h1.join(" ") ?? "";
  return key.path.test(path) || key.heading.test(h1);
}

export const AI_003 = defineRule(
  {
    id: "AI-003",
    category: "ai",
    severity: "medium",
    title: "Missing clear About, Contact, FAQ, Services/Pricing or Policies pages",
    passCondition: "Passes when the crawl finds an About, Contact, FAQ, Services or Pricing, and Policies page.",
    appliesTo: "both",
    autoFixable: false,
    riskLevel: "low",
    confidence: 0.8,
    effort: 4,
    explanation: {
      why: "AI assistants answer questions like 'who runs this shop?', 'how much does it cost?' and 'can I return it?' from these pages. Without them, they guess or skip you.",
      fix: ["Create the missing pages with plain, factual answers.", "Link them from the main menu or footer."],
    },
  },
  (site) => {
    const pages = site.pages.filter((p) => p.isHtml200 && p.facts);
    const found = KEY_PAGES.map((key) => ({ name: key.name, url: pages.find((p) => matches(p, key))?.url ?? null }));
    const missing = found.filter((f) => f.url === null).map((f) => f.name);
    const evidence = { found: found.filter((f) => f.url).map((f) => `${f.name}: ${f.url}`) };
    return [missing.length ? fail(null, { ...evidence, missing }) : pass(null, evidence)];
  },
);
