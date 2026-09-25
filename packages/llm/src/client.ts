import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { SYSTEM_PROMPT } from "./prompts";

export const DEFAULT_MODEL_ID = "claude-opus-5";

/**
 * Models that still accept sampling parameters. Current models (Claude Opus 5, Sonnet 5,
 * Opus 4.7+) reject `temperature` with a 400, so for them reproducibility comes from the
 * output cache (ruleId + contentHash + promptVersion + modelId), not from temperature 0.
 */
const SAMPLING_MODELS = /^claude-(haiku-4-5|sonnet-4-6|opus-4-6|sonnet-4-5|opus-4-5|opus-4-1|opus-4-0|sonnet-4-0)/;

export function supportsTemperature(modelId: string): boolean {
  return SAMPLING_MODELS.test(modelId);
}

export interface GenerateRequest<S extends z.ZodType> {
  prompt: string;
  schema: S;
  maxTokens?: number;
}

/** Anything that can turn a prompt into schema-valid JSON (mocked in tests). */
export interface LlmClient {
  readonly modelId: string;
  /** Returns validated output, or null when the model refused or the output did not validate. */
  generate<S extends z.ZodType>(request: GenerateRequest<S>): Promise<z.infer<S> | null>;
}

export class AnthropicLlmClient implements LlmClient {
  private readonly client: Anthropic;

  constructor(
    readonly modelId: string = DEFAULT_MODEL_ID,
    apiKey?: string,
  ) {
    this.client = new Anthropic(apiKey ? { apiKey } : {});
  }

  async generate<S extends z.ZodType>({ prompt, schema, maxTokens = 4000 }: GenerateRequest<S>): Promise<z.infer<S> | null> {
    const response = await this.client.messages.parse({
      model: this.modelId,
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
      // Short explanations: low effort keeps cost down; thinking stays at the model default.
      output_config: { effort: "low", format: zodOutputFormat(schema) },
      ...(supportsTemperature(this.modelId) ? { temperature: 0 } : {}),
    });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
    const parsed = schema.safeParse(response.parsed_output);
    return parsed.success ? parsed.data : null;
  }
}

/** Builds the client from the environment, or null when no API key is configured. */
export function llmClientFromEnv(env: NodeJS.ProcessEnv = process.env): LlmClient | null {
  const key = env["ANTHROPIC_API_KEY"];
  if (!key) return null;
  return new AnthropicLlmClient(env["LLM_MODEL_ID"] || DEFAULT_MODEL_ID, key);
}
