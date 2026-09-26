import { randomBytes } from "node:crypto";
import type { ScopedPrisma } from "@seo/db";
import { DEFAULT_MODEL_ID, TEMPLATE_MODEL_ID } from "@seo/llm";
import { CODE_VERSIONS } from "@seo/shared";

/** Model id recorded on the crawl: the configured Claude model, or "template" without a key. */
export function configuredModelId(env: NodeJS.ProcessEnv = process.env): string {
  return env["ANTHROPIC_API_KEY"] ? env["LLM_MODEL_ID"] || DEFAULT_MODEL_ID : TEMPLATE_MODEL_ID;
}

/** Creates a queued crawl that records every version needed to reproduce it. */
export async function createCrawl(
  db: ScopedPrisma,
  args: {
    projectId: string;
    inputType: "url" | "code";
    inputRef?: string | null;
    trigger?: "manual" | "scheduled" | "api";
  },
) {
  return db.crawl.create({
    data: {
      projectId: args.projectId,
      inputType: args.inputType,
      inputRef: args.inputRef ?? null,
      trigger: args.trigger ?? "manual",
      status: "queued",
      ...CODE_VERSIONS,
      llmModelId: configuredModelId(),
    } as Parameters<ScopedPrisma["crawl"]["create"]>[0]["data"],
  });
}

export const newCheckId = (): string => `smc_${randomBytes(9).toString("hex")}`;

/** Creates a queued sitemap check ("smc_…"); the caller enqueues it. */
export async function createSitemapCheck(
  db: ScopedPrisma,
  projectId: string,
  trigger: "manual" | "scheduled" | "api" = "manual",
) {
  return db.sitemapCheck.create({
    data: {
      id: newCheckId(),
      projectId,
      trigger,
      status: "queued",
      crawlerVersion: CODE_VERSIONS.crawlerVersion,
      rulesetVersion: CODE_VERSIONS.rulesetVersion,
    } as Parameters<ScopedPrisma["sitemapCheck"]["create"]>[0]["data"],
  });
}
