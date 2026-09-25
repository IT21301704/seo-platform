import { describe, expect, it } from "vitest";
import { check, summary } from "../src/testing";
import { TEC_007 } from "./tec-007-http-to-https";

describe("TEC-007 HTTP → HTTPS", () => {
  it("passes when http:// redirects permanently", async () => {
    expect(summary(await check(TEC_007))).toEqual(["pass http://example-store.com/"]);
  });

  it("is not applicable when http:// does not respond", async () => {
    const outcomes = await check(TEC_007, { server: { alternateOrigins: [] } });
    expect(outcomes[0]?.result).toBe("na");
  });
});
