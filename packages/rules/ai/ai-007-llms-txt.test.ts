import { describe, expect, it } from "vitest";
import { ORIGIN, check, summary } from "../src/testing";
import { AI_007 } from "./ai-007-llms-txt";

describe("AI-007 llms.txt", () => {
  it("is not applicable without llms.txt", async () => {
    expect(summary(await check(AI_007))).toEqual(["na /llms.txt"]);
  });

  it("passes for a well-formed file", async () => {
    const llms = `# Example Store\n\n> Handmade mugs.\n\n- [About](${ORIGIN}/about/): our story\n`;
    expect(summary(await check(AI_007, { files: { "/llms.txt": llms } }))).toEqual([
      "pass /llms.txt",
    ]);
  });

  it("fails without a title and with a broken link", async () => {
    const llms = `Example Store\n- [Old](${ORIGIN}/old/)\n`;
    const outcomes = await check(AI_007, { files: { "/llms.txt": llms } });
    expect(summary(outcomes)).toEqual(["fail /llms.txt"]);
    expect(outcomes[0]?.evidence["problems"]).toEqual(["does not start with a '# ' title"]);
  });
});
