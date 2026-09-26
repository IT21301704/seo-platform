import { describe, expect, it } from "vitest";
import { check, summary } from "../src/testing";
import { TEC_008 } from "./tec-008-www-consistency";

describe("TEC-008 www consistency", () => {
  it("passes when www redirects to the main host", async () => {
    expect(summary(await check(TEC_008))).toEqual(["pass https://www.example-store.com/"]);
  });

  it("is not applicable when the www host does not exist", async () => {
    const outcomes = await check(TEC_008, {
      server: { alternateOrigins: ["http://example-store.com"] },
    });
    expect(outcomes[0]?.result).toBe("na");
  });
});
