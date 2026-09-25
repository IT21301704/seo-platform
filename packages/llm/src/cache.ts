import { createHash } from "node:crypto";
import type { JsonValue } from "@seo/shared";

export interface CacheKeyParts {
  ruleId: string;
  /** Hash of the input content the output depends on. */
  contentHash: string;
  promptVersion: string;
  modelId: string;
}

/** Cache key = sha256(ruleId | contentHash | promptVersion | modelId) (CLAUDE.md rule 4). */
export function cacheKey(parts: CacheKeyParts): string {
  return createHash("sha256")
    .update([parts.ruleId, parts.contentHash, parts.promptVersion, parts.modelId].join("|"))
    .digest("hex");
}

export interface CachedOutput {
  output: JsonValue;
  isFallback: boolean;
}

/** Storage for LLM outputs (llm_outputs table in production, a Map in tests). */
export interface LlmCache {
  get(key: string): Promise<CachedOutput | null>;
  set(key: string, parts: CacheKeyParts, value: CachedOutput): Promise<void>;
}

export class MemoryLlmCache implements LlmCache {
  readonly entries = new Map<string, CachedOutput>();

  async get(key: string): Promise<CachedOutput | null> {
    return this.entries.get(key) ?? null;
  }

  async set(key: string, _parts: CacheKeyParts, value: CachedOutput): Promise<void> {
    this.entries.set(key, value);
  }
}
