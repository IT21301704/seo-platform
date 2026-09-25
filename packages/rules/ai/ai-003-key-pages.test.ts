import { describe, expect, it } from "vitest";
import { check, page, summary } from "../src/testing";
import { AI_003 } from "./ai-003-key-pages";

const paths = ["/about/", "/contact/", "/faq/", "/pricing/", "/policies/privacy/"];

describe("AI-003 key pages", () => {
  it("passes when all key pages exist", async () => {
    const pages = Object.fromEntries([["/", page("/", { nav: paths })], ...paths.map((p) => [p, page(p)])]);
    expect(summary(await check(AI_003, { pages }))).toEqual(["pass site"]);
  });

  it("fails and lists what is missing", async () => {
    const outcomes = await check(AI_003);
    expect(summary(outcomes)).toEqual(["fail site"]);
    expect(outcomes[0]?.evidence["missing"]).toEqual(["Contact", "FAQ", "Services or Pricing", "Policies"]);
  });
});
