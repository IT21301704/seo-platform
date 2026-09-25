import { RULES_BY_ID } from "@seo/rules";
import { PROMPT_VERSION } from "@seo/shared";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { MemoryLlmCache, cacheKey } from "./cache";
import { supportsTemperature } from "./client";
import type { GenerateRequest, LlmClient } from "./client";
import { explainIssue, templateExplanation } from "./explain";
import { explainPrompt } from "./prompts";
import type { Explanation } from "./schemas";

const rule = RULES_BY_ID.get("ONP-004");
if (!rule) throw new Error("ONP-004 missing");

const good: Explanation = {
  whyItMatters: "Search engines use it as the summary.",
  seoImpact: "Clearer results.",
  fixSteps: ["Write one."],
  developerInstructions: '<meta name="description" content="…">',
  contentSuggestion: "",
  sideEffects: "Google may still rewrite it.",
};

class FakeLlm implements LlmClient {
  calls = 0;
  constructor(
    private readonly outputs: (unknown | Error)[],
    readonly modelId = "fake-model",
  ) {}
  async generate<S extends z.ZodType>(req: GenerateRequest<S>): Promise<z.infer<S> | null> {
    const out = this.outputs[Math.min(this.calls++, this.outputs.length - 1)];
    if (out instanceof Error) throw out;
    const parsed = req.schema.safeParse(out);
    return parsed.success ? parsed.data : null;
  }
}

const input = {
  rule,
  items: [{ url: "https://example-store.com/about/", evidence: { problem: "missing" } }],
  excerpt: null,
};

describe("explainIssue", () => {
  it("calls the LLM once, then serves the cache", async () => {
    const llm = new FakeLlm([good]);
    const cache = new MemoryLlmCache();
    const first = await explainIssue(input, { llm, cache });
    const second = await explainIssue(input, { llm, cache });
    expect(first.source).toBe("llm");
    expect(second.source).toBe("cache");
    expect(second.output).toEqual(good);
    expect(llm.calls).toBe(1);
  });

  it("retries once on invalid output, then falls back to the template", async () => {
    const llm = new FakeLlm([{ nope: true }, { still: "bad" }]);
    const result = await explainIssue(input, { llm, cache: new MemoryLlmCache() });
    expect(llm.calls).toBe(2);
    expect(result.source).toBe("template");
    expect(result.output).toEqual(templateExplanation(rule));
  });

  it("falls back to the template on API errors", async () => {
    const result = await explainIssue(input, { llm: new FakeLlm([new Error("503")]), cache: new MemoryLlmCache() });
    expect(result.source).toBe("template");
  });

  it("uses the template without an API key", async () => {
    const result = await explainIssue(input, { llm: null, cache: new MemoryLlmCache() });
    expect(result.source).toBe("template");
    expect(result.modelId).toBe("template");
  });

  it("keys the cache on rule, content, prompt version and model", async () => {
    const result = await explainIssue(input, { llm: new FakeLlm([good], "model-a"), cache: new MemoryLlmCache() });
    const other = await explainIssue(input, { llm: new FakeLlm([good], "model-b"), cache: new MemoryLlmCache() });
    expect(result.cacheKey).not.toBe(other.cacheKey);
    expect(result.promptVersion).toBe(PROMPT_VERSION);
    expect(cacheKey({ ruleId: "A", contentHash: "h", promptVersion: "v1.0", modelId: "m" })).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("prompts", () => {
  it("never asks for numbers and states the engine decides scores", () => {
    const prompt = explainPrompt(rule, input.items, null);
    expect(prompt).not.toMatch(/score\s*:|priority\s*:/i);
  });

  it("only sends temperature to models that accept it", () => {
    expect(supportsTemperature("claude-opus-5")).toBe(false);
    expect(supportsTemperature("claude-sonnet-5")).toBe(false);
    expect(supportsTemperature("claude-haiku-4-5")).toBe(true);
  });
});
