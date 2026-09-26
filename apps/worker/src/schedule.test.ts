import { describe, expect, it } from "vitest";
import { localParts, nextCrawlAt, nextLocalTime } from "./schedule";
import { signPayload, verifySignature } from "./webhooks";

describe("schedule", () => {
  it("finds 02:00 in Colombo (UTC+5:30)", () => {
    // 2026-09-25 10:00 UTC = 15:30 in Colombo → next 02:00 local = 2026-09-25 20:30 UTC.
    expect(nextLocalTime(new Date("2026-09-25T10:00:00Z"), "Asia/Colombo", 2).toISOString()).toBe(
      "2026-09-25T20:30:00.000Z",
    );
  });

  it("schedules weekly crawls on Monday 02:00 local time", () => {
    const next = nextCrawlAt("weekly", "Asia/Colombo", new Date("2026-09-25T10:00:00Z"));
    expect(next?.toISOString()).toBe("2026-09-27T20:30:00.000Z"); // Mon 28 Sep, 02:00 in Colombo
    expect(localParts(next ?? new Date(), "Asia/Colombo")).toMatchObject({
      weekday: 1,
      hour: 2,
      minute: 0,
    });
  });

  it("handles daylight saving time", () => {
    // London is UTC+1 in September.
    expect(
      nextCrawlAt("daily", "Europe/London", new Date("2026-09-25T10:00:00Z"))?.toISOString(),
    ).toBe("2026-09-26T01:00:00.000Z");
  });

  it("does not schedule manual projects", () => {
    expect(nextCrawlAt("manual", "UTC", new Date())).toBeNull();
  });
});

describe("webhook signatures", () => {
  const body = JSON.stringify({ event: "sitemap.check.completed", data: { score: 76 } });

  it("verifies a fresh, untampered signature", () => {
    const sig = signPayload("s3cret", 1_000_000, body);
    expect(verifySignature("s3cret", sig, body, 1_000_100)).toBe(true);
  });

  it("rejects tampering, wrong secrets and replays older than 5 minutes", () => {
    const sig = signPayload("s3cret", 1_000_000, body);
    expect(verifySignature("s3cret", sig, `${body} `, 1_000_000)).toBe(false);
    expect(verifySignature("other", sig, body, 1_000_000)).toBe(false);
    expect(verifySignature("s3cret", sig, body, 1_000_000 + 301)).toBe(false);
  });
});
