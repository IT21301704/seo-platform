// Versioned prompts. Changing any text here requires bumping PROMPT_VERSION (@seo/shared).
import type { RuleDefinition } from "@seo/rules";
import { stableStringify } from "@seo/shared";
import type { JsonValue } from "@seo/shared";

export const SYSTEM_PROMPT = `You explain website SEO problems to small-business owners and their developers.

Facts you must respect:
- A deterministic rule engine already decided that the check failed, how severe it is, and its priority. Never question, restate or change a score, severity or priority.
- Never invent numbers: no search volumes, rankings, traffic, speeds, percentages or dates. Only use numbers that appear in the input.
- Never promise rankings, indexing, traffic or a place in AI answers. Search engines decide those.
- Do not suggest manipulative tactics (keyword stuffing, buying links, cloaking, hidden text).
- Prefer fixing the setting that generates the page (CMS, SEO plugin, theme, framework) over editing the HTML output.

Write in plain English for a non-technical reader, short sentences. "developerInstructions" may include a short code snippet.`;

export interface FailingItem {
  url: string | null;
  evidence: Record<string, JsonValue>;
}

export interface PageExcerpt {
  url: string;
  title: string | null;
  headings: string[];
  /** First 2,000 words of the main content. */
  text: string;
}

export function explainPrompt(rule: RuleDefinition, items: FailingItem[], excerpt: PageExcerpt | null): string {
  const input = {
    check: {
      id: rule.id,
      title: rule.title,
      passCondition: rule.passCondition,
      category: rule.category,
      referenceExplanation: rule.explanation,
    },
    failingItems: items,
    samplePage: excerpt,
  };
  return `Explain this failed SEO check for the site owner.

Return JSON with:
- whyItMatters: 2–3 sentences on why this matters for search engines, AI assistants and visitors.
- seoImpact: one sentence on the likely effect, without numbers or guarantees.
- fixSteps: 2–5 short, concrete steps.
- developerInstructions: precise instructions for a developer, optionally with a short code snippet.
- contentSuggestion: example text to use (for example a better title or description for the sample page), or "" if not relevant.
- sideEffects: what could change or go wrong after the fix, in one or two sentences.

Input (JSON):
${stableStringify(input, 2)}`;
}

export function descriptionDraftPrompt(pages: PageExcerpt[]): string {
  return `Write a meta description for each page below.

Rules for every description:
- 70 to 160 characters, one or two plain sentences.
- Describe only what the page actually says; do not invent prices, offers or claims.
- Every description must be different.
- No keyword stuffing, no ALL CAPS, no emoji.

Return JSON: {"drafts": [{"url": "...", "description": "..."}]} with one entry per page, same URLs.

Pages (JSON):
${stableStringify(pages, 2)}`;
}
