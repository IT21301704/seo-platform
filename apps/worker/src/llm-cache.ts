import type { Prisma, ScopedPrisma } from "@seo/db";
import type { CacheKeyParts, CachedOutput, LlmCache } from "@seo/llm";
import type { JsonValue } from "@seo/shared";

/** LLM output cache in the llm_outputs table (per organization). */
export class DbLlmCache implements LlmCache {
  constructor(private readonly db: ScopedPrisma) {}

  async get(key: string): Promise<CachedOutput | null> {
    const row = await this.db.llmOutput.findFirst({ where: { cacheKey: key } });
    return row ? { output: row.output as JsonValue, isFallback: row.isFallback } : null;
  }

  async set(key: string, parts: CacheKeyParts, value: CachedOutput): Promise<void> {
    const existing = await this.db.llmOutput.findFirst({ where: { cacheKey: key }, select: { id: true } });
    const data = {
      output: value.output as Prisma.InputJsonValue,
      isFallback: value.isFallback,
    };
    if (existing) {
      await this.db.llmOutput.update({ where: { id: existing.id }, data });
      return;
    }
    await this.db.llmOutput.create({
      data: { cacheKey: key, ...parts, ...data } as Prisma.LlmOutputUncheckedCreateInput,
    });
  }
}
