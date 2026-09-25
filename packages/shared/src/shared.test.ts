import { describe, expect, it } from "vitest";
import {
  CATEGORY_WEIGHTS_V1,
  CODE_VERSIONS,
  RULE_ID_PREFIX,
  SCORED_CATEGORIES,
  SEVERITY_WEIGHTS,
  isRuleId,
} from "./index";

describe("versions", () => {
  it("uses semver for crawler and ruleset", () => {
    expect(CODE_VERSIONS.crawlerVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(CODE_VERSIONS.rulesetVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("uses vN for weights and vN.N for prompts", () => {
    expect(CODE_VERSIONS.weightsVersion).toMatch(/^v\d+$/);
    expect(CODE_VERSIONS.promptVersion).toMatch(/^v\d+\.\d+$/);
  });
});

describe("scoring constants", () => {
  it("category weights sum to 100", () => {
    const total = Object.values(CATEGORY_WEIGHTS_V1).reduce((sum, w) => sum + w, 0);
    expect(total).toBe(100);
  });

  it("has a weight for every scored category", () => {
    expect(Object.keys(CATEGORY_WEIGHTS_V1).sort()).toEqual([...SCORED_CATEGORIES].sort());
  });

  it("severity weights follow the spec", () => {
    expect(SEVERITY_WEIGHTS).toEqual({ critical: 10, high: 5, medium: 2, low: 1 });
  });
});

describe("rule ids", () => {
  it("accepts ids for every category prefix", () => {
    for (const prefix of Object.values(RULE_ID_PREFIX)) {
      expect(isRuleId(`${prefix}-001`)).toBe(true);
    }
  });

  it.each(["ONP-4", "onp-004", "XYZ-001", "ONP-0040", ""])("rejects %j", (id) => {
    expect(isRuleId(id)).toBe(false);
  });
});
