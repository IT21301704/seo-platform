import { describe, expect, it } from "vitest";
import { googleSyncJobId } from "./queue";

describe("googleSyncJobId", () => {
  it("never contains ':' (BullMQ rejects it) and stays unique per project and key", () => {
    const id = googleSyncJobId("prj_1", "2026-09-26");
    expect(id).toBe("prj_1--2026-09-26");
    expect(googleSyncJobId("prj_1", "manual:1")).not.toContain(":");
    expect(googleSyncJobId("prj_2", "2026-09-26")).not.toBe(id);
  });
});
