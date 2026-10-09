// Phase 3 drafting tasks: page titles (auto-fix), keyword clusters and content-gap page briefs
// (keyword research). Same contract as explanations: cached by task + content hash + prompt
// version + model, Zod-validated, never asked for numbers we must measure.
import { createHash } from "node:crypto";
import { z } from "zod";
import { DRAFT_PROMPT_VERSION, stableStringify } from "@seo/shared";
import type { JsonValue } from "@seo/shared";
import { cacheKey } from "./cache";
import type { LlmCache } from "./cache";
import type { LlmClient } from "./client";
import type { LlmResult } from "./explain";
import type { PageExcerpt } from "./prompts";

export const TitleDraftsSchema = z.object({
  drafts: z.array(z.object({ url: z.string(), title: z.string().min(1).max(120) })).max(50),
});
export type TitleDrafts = z.infer<typeof TitleDraftsSchema>;

export const KeywordClustersSchema = z.object({
  clusters: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        keywords: z.array(z.string().min(1).max(200)).min(1).max(200),
      }),
    )
    .max(60),
});
export type KeywordClusters = z.infer<typeof KeywordClustersSchema>;

export const PageBriefSchema = z.object({
  workingTitle: z.string().min(1).max(120),
  searchIntent: z.string().min(1).max(300),
  outline: z.array(z.string().min(1).max(200)).min(3).max(12),
  questionsToAnswer: z.array(z.string().min(1).max(200)).max(8),
  internalLinks: z.array(z.string().max(300)).max(8),
  notes: z.string().max(600),
});
export type PageBrief = z.infer<typeof PageBriefSchema>;

const hashOf = (value: unknown): string =>
  createHash("sha256").update(stableStringify(value)).digest("hex");

interface Task<S extends z.ZodType> {
  /** Cache namespace, e.g. "draft:title". */
  task: string;
  input: unknown;
  schema: S;
  prompt: string;
  maxTokens?: number;
}

/** cache → Claude (one retry) → null. Returns null without an LLM, or with cachedOnly. */
async function cachedGenerate<S extends z.ZodType>(
  t: Task<S>,
  deps: { llm: LlmClient | null; cache: LlmCache; cachedOnly?: boolean },
): Promise<LlmResult<z.infer<S>> | null> {
  if (!deps.llm) return null;
  const parts = {
    ruleId: t.task,
    contentHash: hashOf(t.input),
    promptVersion: DRAFT_PROMPT_VERSION,
    modelId: deps.llm.modelId,
  };
  const key = cacheKey(parts);
  const base = { modelId: deps.llm.modelId, promptVersion: DRAFT_PROMPT_VERSION, cacheKey: key };
  const cached = await deps.cache.get(key);
  const parsed = cached ? t.schema.safeParse(cached.output) : null;
  if (parsed?.success) return { ...base, output: parsed.data, source: "cache" };
  if (deps.cachedOnly) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let output: z.infer<S> | null;
    try {
      output = await deps.llm.generate({
        prompt: t.prompt,
        schema: t.schema,
        maxTokens: t.maxTokens ?? 8000,
      });
    } catch {
      output = null;
    }
    if (output) {
      await deps.cache.set(key, parts, { output: output as JsonValue, isFallback: false });
      return { ...base, output, source: "llm" };
    }
  }
  return null;
}

export function titleDraftPrompt(
  pages: (PageExcerpt & { otherTitles?: string[] })[],
  limits: { min: number; max: number },
): string {
  return `Write an HTML <title> for each page below.

Rules for every title:
- ${limits.min} to ${limits.max} characters.
- Name what is unique about the page (product, service, topic) first; the brand may follow after " | ".
- Every title must be different from the others and from "otherTitles".
- Describe only what the page actually says; no invented prices, offers or claims.
- No keyword stuffing, no ALL CAPS, no emoji.

Return JSON: {"drafts": [{"url": "...", "title": "..."}]} with one entry per page, same URLs.

Pages (JSON):
${stableStringify(pages, 2)}`;
}

/** Drafts page titles (ONP-001/002/003 auto-fix). The rule engine re-checks every draft. */
export function draftTitles(
  pages: (PageExcerpt & { otherTitles?: string[] })[],
  limits: { min: number; max: number },
  deps: { llm: LlmClient | null; cache: LlmCache; cachedOnly?: boolean },
): Promise<LlmResult<TitleDrafts> | null> {
  return cachedGenerate(
    {
      task: "draft:title",
      input: { pages, limits },
      schema: TitleDraftsSchema,
      prompt: titleDraftPrompt(pages, limits),
    },
    deps,
  );
}

export function clusterPrompt(keywords: string[]): string {
  return `Group these search queries (from the site's own Search Console data) into topic clusters.

Rules:
- Put every query in exactly one cluster; use each query text exactly as given.
- A cluster is a set of queries one page could answer well. Name it with a short plain phrase.
- Do not add queries, numbers, volumes or difficulty scores.

Return JSON: {"clusters": [{"name": "...", "keywords": ["...", "..."]}]}

Queries (JSON):
${stableStringify(keywords, 2)}`;
}

/** Clusters queries (M18). Null without an LLM; callers fall back to word-based clusters. */
export function clusterKeywords(
  keywords: string[],
  deps: { llm: LlmClient | null; cache: LlmCache; cachedOnly?: boolean },
): Promise<LlmResult<KeywordClusters> | null> {
  const sorted = [...new Set(keywords)].sort().slice(0, 400);
  return cachedGenerate(
    {
      task: "keywords:clusters",
      input: sorted,
      schema: KeywordClustersSchema,
      prompt: clusterPrompt(sorted),
      maxTokens: 12000,
    },
    deps,
  );
}

export interface BriefInput {
  site: string;
  cluster: string;
  keywords: string[];
  /** Existing pages the new page could link to (title + URL). */
  relatedPages: { url: string; title: string | null }[];
}

export function pageBriefPrompt(input: BriefInput): string {
  return `Draft a page brief for a new page on ${input.site} that covers this topic cluster.

The site has no page for it yet. The brief is reviewed by the owner before anyone writes the page.

Rules:
- Base it only on the queries and pages below. Do not invent facts about the business, prices or offers.
- No search volumes, rankings, traffic or other numbers.
- No keyword stuffing: the outline should read naturally for a visitor.
- internalLinks: pick from the related page URLs only.

Return JSON with workingTitle, searchIntent, outline (section headings), questionsToAnswer, internalLinks, notes.

Input (JSON):
${stableStringify(input, 2)}`;
}

/** Content-gap page outline (M18 "Create page brief"). Null without an LLM. */
export function draftPageBrief(
  input: BriefInput,
  deps: { llm: LlmClient | null; cache: LlmCache; cachedOnly?: boolean },
): Promise<LlmResult<PageBrief> | null> {
  return cachedGenerate(
    {
      task: "keywords:brief",
      input,
      schema: PageBriefSchema,
      prompt: pageBriefPrompt(input),
      maxTokens: 4000,
    },
    deps,
  );
}
