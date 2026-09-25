import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { AI_005 } from "./ai-005-nosnippet";

describe("AI-005 nosnippet", () => {
  it("passes when snippets are allowed", async () => {
    expect(summary(await check(AI_005))).toEqual(["pass /", "pass /about/"]);
  });

  it.each(["nosnippet", "max-snippet:0"])("fails for %s on an important page", async (robots) => {
    const pages = { ...defaultPages(), "/about/": page("/about/", { robots }) };
    expect(summary(await check(AI_005, { pages }))).toEqual(["pass /", "fail /about/"]);
  });
});
