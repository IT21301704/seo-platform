import { describe, expect, it } from "vitest";
import { check, defaultPages, page, summary } from "../src/testing";
import { ONP_004 } from "./onp-004-meta-description";

describe("ONP-004 meta description", () => {
  it("passes for unique 70–160 character descriptions", async () => {
    expect(summary(await check(ONP_004))).toEqual(["pass /", "pass /about/"]);
  });

  it.each([
    [null, "missing"],
    ["Contact us", "too short"],
    ["x".repeat(161), "too long"],
  ])("fails when the description is %j (%s)", async (description, problem) => {
    const pages = { ...defaultPages(), "/about/": page("/about/", { description }) };
    const outcomes = await check(ONP_004, { pages });
    expect(summary(outcomes)).toEqual(["pass /", "fail /about/"]);
    expect(outcomes[1]?.evidence["problem"]).toBe(problem);
  });

  it("fails for duplicates", async () => {
    const description = "The same description on two different pages is not helpful to searchers.";
    const pages = { "/": page("/", { nav: ["/about/"], description }), "/about/": page("/about/", { description }) };
    expect(summary(await check(ONP_004, { pages }))).toEqual(["fail /", "fail /about/"]);
  });
});

describe("recheckDescription", () => {
  it("applies the same limits as ONP-004", async () => {
    const { recheckDescription } = await import("./onp-004-meta-description");
    expect(recheckDescription("Contact us", [])).toBe("too short");
    const ok = "Browse our full range of ceramic and enamel mugs, from everyday coffee cups to gift sets.";
    expect(recheckDescription(ok, [])).toBe("pass");
    expect(recheckDescription(ok, [ok.toUpperCase()])).toBe("duplicate");
  });
});
