import { describe, expect, it } from "vitest";
import { itemWhere, parseFilters, toQuery } from "./filters";

describe("issue manager filters", () => {
  it("falls back to safe defaults for unknown values", () => {
    expect(
      parseFilters({
        view: "kanban",
        severity: "urgent",
        status: "x",
        limit: "99999",
        since: "yesterday",
        assignee: "'; drop",
      }),
    ).toMatchObject({
      view: "grouped",
      severity: "all",
      status: "open",
      limit: 500,
      since: "",
      assignee: "all",
    });
  });

  it("round-trips non-default filters through the query string", () => {
    const f = parseFilters({
      view: "board",
      q: "/products",
      severity: "high",
      source: "sitemap_api",
      fix: "auto-low",
      new: "1",
      since: "2026-09-01",
    });
    expect(toQuery(f)).toBe(
      "?view=board&q=%2Fproducts&severity=high&source=sitemap_api&fix=auto-low&since=2026-09-01&new=1",
    );
    expect(toQuery(parseFilters({}))).toBe("");
  });

  it("always scopes items to the project and hides resolved items by default", () => {
    expect(itemWhere("prj_1", parseFilters({}))).toMatchObject({
      projectId: "prj_1",
      auditTag: { not: "resolved" },
    });
  });

  it("combines issue-level filters into one relation filter", () => {
    const where = itemWhere(
      "prj_1",
      parseFilters({ severity: "critical", source: "monitoring", category: "indexing" }),
    );
    expect(where.issue).toEqual({
      severity: "critical",
      source: "monitoring",
      category: "indexing",
    });
  });

  it("filters by fix type through the rule registry, and by assignee", () => {
    const where = itemWhere("prj_1", parseFilters({ fix: "auto-low", assignee: "me" }), "usr_9");
    expect((where.ruleId as { in: string[] }).in).toContain("ONP-004");
    expect((where.ruleId as { in: string[] }).in).not.toContain("IDX-003");
    expect(where.assigneeId).toBe("usr_9");
    expect(itemWhere("prj_1", parseFilters({ assignee: "none" })).assigneeId).toBeNull();
  });
});
