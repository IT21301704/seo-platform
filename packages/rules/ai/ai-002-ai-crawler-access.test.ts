import { describe, expect, it } from "vitest";
import { DEFAULT_ROBOTS, check, summary } from "../src/testing";
import { AI_002 } from "./ai-002-ai-crawler-access";

const blockGpt = `User-agent: GPTBot\nDisallow: /\n\n${DEFAULT_ROBOTS}`;

describe("AI-002 AI crawler access", () => {
  it("passes when AI crawlers are allowed and the owner wants that", async () => {
    expect(summary(await check(AI_002))).toEqual(["pass site"]);
  });

  it("fails when GPTBot is blocked but the owner wants AI crawlers", async () => {
    const outcomes = await check(AI_002, { files: { "/robots.txt": blockGpt } });
    expect(summary(outcomes)).toEqual(["fail site"]);
    expect(outcomes[0]?.evidence["mismatched"]).toEqual(["GPTBot"]);
  });

  it("fails when the owner wants to block AI crawlers but robots.txt allows them", async () => {
    expect(summary(await check(AI_002, { ownerIntent: { aiCrawlers: "block" } }))).toEqual([
      "fail site",
    ]);
  });
});
