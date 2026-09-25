import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RULE_ID_PREFIX, SCORED_CATEGORIES, isRuleId } from "@seo/shared";
import { describe, expect, it } from "vitest";
import { RULES } from "./registry";

const root = fileURLToPath(new URL("..", import.meta.url));

describe("rule registry", () => {
  it("has unique, well-formed IDs in sorted order", () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(isRuleId)).toBe(true);
    expect([...ids].sort()).toEqual(ids);
  });

  it.each(RULES.map((r) => [r.id, r] as const))("%s has consistent metadata", (id, rule) => {
    expect(id.startsWith(`${RULE_ID_PREFIX[rule.category]}-`)).toBe(true);
    expect(SCORED_CATEGORIES).toContain(rule.scoreCategory);
    expect(rule.impact).toBeGreaterThanOrEqual(1);
    expect(rule.impact).toBeLessThanOrEqual(5);
    expect(rule.effort).toBeGreaterThanOrEqual(1);
    expect(rule.effort).toBeLessThanOrEqual(5);
    expect(rule.confidence).toBeGreaterThan(0);
    expect(rule.confidence).toBeLessThanOrEqual(1);
    expect(rule.passCondition).toMatch(/^(Passes|Optional)/);
    expect(rule.explanation.fix.length).toBeGreaterThan(0);
  });

  it("has a test file for every rule file", () => {
    for (const category of Object.keys(RULE_ID_PREFIX)) {
      const dir = `${root}/${category}`;
      if (!existsSync(dir)) continue;
      const files = readdirSync(dir);
      for (const file of files.filter((f) => /^[a-z]+-\d{3}-.+\.ts$/.test(f) && !f.endsWith(".test.ts"))) {
        const id = file.slice(0, file.indexOf("-", file.indexOf("-") + 1));
        const tested = files.some((f) => f.endsWith(".test.ts") && (f.startsWith(file.replace(".ts", "")) || f.includes(id)));
        const sharedTest = files.some((f) => f.endsWith(".test.ts") && f.startsWith(`${id.split("-")[0]}-`) && f.includes("web-vitals"));
        expect(tested || sharedTest, `${category}/${file}`).toBe(true);
      }
    }
  });
});
