import { createHash } from "node:crypto";
import type { RuleDefinition } from "@seo/rules";
import { PROMPT_VERSION, stableStringify } from "@seo/shared";
import type { JsonValue } from "@seo/shared";
import { cacheKey } from "./cache";
import type { LlmCache } from "./cache";
import type { LlmClient } from "./client";
import { DescriptionDraftsSchema, ExplanationSchema } from "./schemas";
import type { DescriptionDrafts, Explanation } from "./schemas";
import { descriptionDraftPrompt, explainPrompt } from "./prompts";
import type { FailingItem, PageExcerpt } from "./prompts";

/** Failing items sent per prompt (similar issues are batched into one call). */
export const MAX_ITEMS_PER_PROMPT = 24;
export const TEMPLATE_MODEL_ID = "template";

export interface LlmResult<T> {
  output: T;
  source: "cache" | "llm" | "template";
  modelId: string;
  promptVersion: string;
  cacheKey: string;
}

function hashOf(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

/** Deterministic explanation from the rule's own text: used without an API key or on failure. */
export function templateExplanation(rule: RuleDefinition): Explanation {
  return {
    whyItMatters: rule.explanation.why,
    seoImpact: "Fixing this removes a known obstacle for search engines and AI assistants. It does not guarantee rankings.",
    fixSteps: rule.explanation.fix,
    developerInstructions: rule.passCondition,
    contentSuggestion: "",
    sideEffects: "Re-run the audit after the change to confirm the check passes.",
  };
}

export interface ExplainInput {
  rule: RuleDefinition;
  items: FailingItem[];
  excerpt: PageExcerpt | null;
}

/**
 * Explains a failed rule. Order: cache → Claude (retry once on invalid output) → template.
 * Output never feeds back into scoring.
 */
export async function explainIssue(
  input: ExplainInput,
  deps: { llm: LlmClient | null; cache: LlmCache },
): Promise<LlmResult<Explanation>> {
  const items = [...input.items].slice(0, MAX_ITEMS_PER_PROMPT);
  const modelId = deps.llm?.modelId ?? TEMPLATE_MODEL_ID;
  const parts = {
    ruleId: input.rule.id,
    contentHash: hashOf({ items, excerpt: input.excerpt }),
    promptVersion: PROMPT_VERSION,
    modelId,
  };
  const key = cacheKey(parts);
  const base = { modelId, promptVersion: PROMPT_VERSION, cacheKey: key };

  const cached = await deps.cache.get(key);
  if (cached) {
    const parsed = ExplanationSchema.safeParse(cached.output);
    if (parsed.success) return { ...base, output: parsed.data, source: cached.isFallback ? "template" : "cache" };
  }

  if (deps.llm) {
    const prompt = explainPrompt(input.rule, items, input.excerpt);
    for (let attempt = 0; attempt < 2; attempt++) {
      let output: Explanation | null = null;
      try {
        output = await deps.llm.generate({ prompt, schema: ExplanationSchema });
      } catch {
        output = null; // network/API errors: the SDK already retried; fall through to template
      }
      if (output) {
        await deps.cache.set(key, parts, { output: output as unknown as JsonValue, isFallback: false });
        return { ...base, output, source: "llm" };
      }
    }
  }

  const output = templateExplanation(input.rule);
  // Template results are only cached under the template model id, so a later run with an
  // API key still asks Claude.
  if (!deps.llm) await deps.cache.set(key, parts, { output: output as unknown as JsonValue, isFallback: true });
  return { ...base, output, source: "template" };
}

/** Drafts meta descriptions for pages (ONP-004 preview). Returns null without an LLM. */
export async function draftDescriptions(
  pages: PageExcerpt[],
  deps: { llm: LlmClient | null; cache: LlmCache },
): Promise<LlmResult<DescriptionDrafts> | null> {
  if (!deps.llm) return null;
  const parts = {
    ruleId: "ONP-004:draft",
    contentHash: hashOf(pages),
    promptVersion: PROMPT_VERSION,
    modelId: deps.llm.modelId,
  };
  const key = cacheKey(parts);
  const base = { modelId: deps.llm.modelId, promptVersion: PROMPT_VERSION, cacheKey: key };
  const cached = await deps.cache.get(key);
  const parsedCache = cached ? DescriptionDraftsSchema.safeParse(cached.output) : null;
  if (parsedCache?.success) return { ...base, output: parsedCache.data, source: "cache" };

  for (let attempt = 0; attempt < 2; attempt++) {
    let output: DescriptionDrafts | null = null;
    try {
      output = await deps.llm.generate({ prompt: descriptionDraftPrompt(pages), schema: DescriptionDraftsSchema, maxTokens: 8000 });
    } catch {
      output = null;
    }
    if (output) {
      await deps.cache.set(key, parts, { output: output as unknown as JsonValue, isFallback: false });
      return { ...base, output, source: "llm" };
    }
  }
  return null;
}
