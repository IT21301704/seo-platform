import { z } from "zod";

/**
 * Explanation of a failed rule (REQUIREMENTS M7). Deliberately has no numeric fields:
 * the LLM never produces scores, priorities or measurements.
 */
export const ExplanationSchema = z.object({
  whyItMatters: z.string().min(1).max(800),
  seoImpact: z.string().min(1).max(400),
  fixSteps: z.array(z.string().min(1).max(300)).min(1).max(6),
  developerInstructions: z.string().max(1500),
  contentSuggestion: z.string().max(600),
  sideEffects: z.string().max(400),
});
export type Explanation = z.infer<typeof ExplanationSchema>;

/** Draft meta descriptions for a batch of pages (read-only preview in Phase 1). */
export const DescriptionDraftsSchema = z.object({
  drafts: z
    .array(
      z.object({
        url: z.string(),
        description: z.string().min(1).max(300),
      }),
    )
    .max(50),
});
export type DescriptionDrafts = z.infer<typeof DescriptionDraftsSchema>;
