import { DRAFT_PROMPT_VERSION } from "@seo/shared";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { MemoryLlmCache } from "./cache";
import type { GenerateRequest, LlmClient } from "./client";
import { clusterKeywords, draftPageBrief, draftTitles } from "./drafts";

class FakeLlm implements LlmClient {
  calls = 0;
  readonly prompts: string[] = [];
  constructor(
    private readonly outputs: unknown[],
    readonly modelId = "fake-model",
  ) {}
  async generate<S extends z.ZodType>(req: GenerateRequest<S>): Promise<z.infer<S> | null> {
    this.prompts.push(req.prompt);
    const out = this.outputs[Math.min(this.calls++, this.outputs.length - 1)];
    const parsed = req.schema.safeParse(out);
    return parsed.success ? parsed.data : null;
  }
}

const page = {
  url: "https://example-store.com/products/speckled-stoneware-mug/",
  title: "Blue ceramic mug | Example Store",
  headings: ["Speckled stoneware mug"],
  text: "A speckled stoneware mug, 300 ml.",
  otherTitles: ["Blue ceramic mug | Example Store"],
};

describe("draftTitles", () => {
  it("returns null without an LLM (the owner types the title)", async () => {
    expect(
      await draftTitles([page], { min: 30, max: 60 }, { llm: null, cache: new MemoryLlmCache() }),
    ).toBeNull();
  });

  it("asks once, validates, then serves the cache with the draft prompt version", async () => {
    const llm = new FakeLlm([
      { drafts: [{ url: page.url, title: "Speckled stoneware mug, 300 ml | Example Store" }] },
    ]);
    const cache = new MemoryLlmCache();
    const first = await draftTitles([page], { min: 30, max: 60 }, { llm, cache });
    expect(first).toMatchObject({ source: "llm", promptVersion: DRAFT_PROMPT_VERSION });
    expect(llm.prompts[0]).toMatch(/30 to 60 characters/);
    const second = await draftTitles([page], { min: 30, max: 60 }, { llm, cache });
    expect(second?.source).toBe("cache");
    expect(llm.calls).toBe(1);
  });

  it("gives up after one retry on invalid output", async () => {
    const llm = new FakeLlm([{ drafts: "nope" }]);
    expect(
      await draftTitles([page], { min: 30, max: 60 }, { llm, cache: new MemoryLlmCache() }),
    ).toBeNull();
    expect(llm.calls).toBe(2);
  });

  it("cachedOnly never calls the model", async () => {
    const llm = new FakeLlm([]);
    const result = await draftTitles(
      [page],
      { min: 30, max: 60 },
      { llm, cache: new MemoryLlmCache(), cachedOnly: true },
    );
    expect(result).toBeNull();
    expect(llm.calls).toBe(0);
  });
});

describe("keyword prompts", () => {
  it("clusters queries without asking for numbers", async () => {
    const llm = new FakeLlm([
      { clusters: [{ name: "Ceramic mugs", keywords: ["ceramic mugs", "gift mugs"] }] },
    ]);
    const result = await clusterKeywords(["gift mugs", "ceramic mugs", "gift mugs"], {
      llm,
      cache: new MemoryLlmCache(),
    });
    expect(result?.output.clusters[0]?.name).toBe("Ceramic mugs");
    expect(llm.prompts[0]).toMatch(/Do not add queries, numbers, volumes/);
  });

  it("drafts a page brief from the cluster only", async () => {
    const brief = {
      workingTitle: "Personalised mugs",
      searchIntent: "People want a mug with a name or message on it.",
      outline: ["What we personalise", "How to order", "Care"],
      questionsToAnswer: ["How long does it take?"],
      internalLinks: ["https://example-store.com/services/"],
      notes: "",
    };
    const llm = new FakeLlm([brief]);
    const result = await draftPageBrief(
      {
        site: "example-store.com",
        cluster: "personalised mugs",
        keywords: ["personalised mugs"],
        relatedPages: [{ url: "https://example-store.com/services/", title: "Services" }],
      },
      { llm, cache: new MemoryLlmCache() },
    );
    expect(result?.output).toEqual(brief);
    expect(llm.prompts[0]).toMatch(/No search volumes, rankings/);
  });
});
