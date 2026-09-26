import { describe, expect, it } from "vitest";
import { itemWhere, parseFilters, toQuery } from "./filters";

describe("issue manager filters", () => {
  it("falls back to safe defaults for unknown values", () => {
    expect(
      parseFilters({ view: "board", severity: "urgent", status: "x", limit: "99999" }),
    ).toEqual({
      view: "grouped",
      q: "",
      severity: "all",
      status: "open",
      limit: 500,
    });
  });

  it("round-trips non-default filters through the query string", () => {
    const f = parseFilters({ view: "flat", q: "/products", severity: "high", status: "all" });
    expect(toQuery(f)).toBe("?view=flat&q=%2Fproducts&severity=high&status=all");
    expect(toQuery(parseFilters({}))).toBe("");
  });

  it("always scopes items to the project and hides resolved items by default", () => {
    const where = itemWhere("prj_1", parseFilters({}));
    expect(where).toMatchObject({ projectId: "prj_1", auditTag: { not: "resolved" } });
  });
});
