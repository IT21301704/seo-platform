import { describe, expect, it } from "vitest";
import { nowPassing, stableKey, stillFailing } from "./issues";

describe("issue item workflow (REQUIREMENTS M19)", () => {
  it("builds stable keys from rule + URL", () => {
    expect(stableKey("ONP-004", "https://a.com/x/")).toBe("ONP-004|https://a.com/x/");
    expect(stableKey("AI-002", null)).toBe("AI-002|site");
  });

  it("keeps open items open and tags them still open", () => {
    expect(stillFailing({ status: "in_progress", auditTag: "new" })).toEqual({
      status: "in_progress",
      auditTag: "still_open",
      regressed: false,
    });
  });

  it("reopens a verified item that fails again (regressed)", () => {
    expect(stillFailing({ status: "verified", auditTag: "resolved" })).toEqual({
      status: "reopened",
      auditTag: "regressed",
      regressed: true,
    });
  });

  it("sends a 'fixed' item back to open when the re-check fails", () => {
    expect(stillFailing({ status: "fixed", auditTag: "still_open" }).status).toBe("open");
  });

  it("keeps ignored items ignored", () => {
    expect(stillFailing({ status: "ignored", auditTag: "still_open" }).status).toBe("ignored");
    expect(nowPassing({ status: "ignored" })).toEqual({ status: "ignored", auditTag: "resolved" });
  });

  it("verifies items whose check now passes", () => {
    expect(nowPassing({ status: "open" })).toEqual({ status: "verified", auditTag: "resolved" });
  });
});
