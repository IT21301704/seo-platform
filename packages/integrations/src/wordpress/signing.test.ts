import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  HEADER,
  MAX_SKEW_SECONDS,
  decodeConnectionKey,
  encodeConnectionKey,
  sha256Hex,
  signRequest,
  signatureBase,
  verifySignedRequest,
} from "./signing";

const secret = "test-secret-0123456789abcdef";
const now = new Date("2026-09-27T10:00:00Z");
const request = {
  keyId: "int_1",
  method: "POST",
  route: "/seo-platform/v1/write",
  body: '{"items":[]}',
  now,
  nonce: "00112233445566778899aabbccddeeff",
};

const lookup = (headers: Record<string, string>) => (name: string) => headers[name] ?? null;

describe("request signing", () => {
  it("builds the base string the PHP plugin builds", () => {
    expect(signatureBase("1790503200", request.nonce, "post", request.route, request.body)).toBe(
      ["1790503200", request.nonce, "POST", request.route, sha256Hex(request.body)].join("\n"),
    );
    // Same vector as apps/wp-plugin/tests/signature-test.php.
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("signs with HMAC-SHA256 over the base string", () => {
    const headers = signRequest(secret, request);
    expect(headers[HEADER.timestamp]).toBe("1790503200");
    expect(headers[HEADER.nonce]).toBe(request.nonce);
    const base = signatureBase("1790503200", request.nonce, "POST", request.route, request.body);
    expect(headers[HEADER.signature]).toBe(
      `v1=${createHmac("sha256", secret).update(base).digest("hex")}`,
    );
  });

  it("verifies its own signature", () => {
    const headers = signRequest(secret, request);
    expect(verifySignedRequest(secret, lookup(headers), request)).toEqual({
      ok: true,
      keyId: "int_1",
      nonce: request.nonce,
      timestamp: 1790503200,
    });
  });

  it("rejects a changed body, route, method or secret", () => {
    const headers = signRequest(secret, request);
    for (const changed of [
      { ...request, body: '{"items":[1]}' },
      { ...request, route: "/seo-platform/v1/read" },
      { ...request, method: "GET" },
    ]) {
      expect(verifySignedRequest(secret, lookup(headers), changed)).toEqual({
        ok: false,
        reason: "bad-signature",
      });
    }
    expect(verifySignedRequest("other-secret", lookup(headers), request).ok).toBe(false);
  });

  it("rejects old or future timestamps and missing headers", () => {
    const headers = signRequest(secret, request);
    const later = new Date(now.getTime() + (MAX_SKEW_SECONDS + 1) * 1000);
    expect(verifySignedRequest(secret, lookup(headers), { ...request, now: later })).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(verifySignedRequest(secret, lookup({}), request)).toEqual({
      ok: false,
      reason: "missing",
    });
  });
});

describe("connection key", () => {
  it("round-trips and rejects anything else", () => {
    const text = encodeConnectionKey({ app: "https://app.example", key: "int_1", secret });
    expect(text).toMatch(/^seowp_/);
    expect(decodeConnectionKey(text)).toEqual({
      v: 1,
      app: "https://app.example",
      key: "int_1",
      secret,
    });
    expect(decodeConnectionKey("seowp_notbase64json")).toBeNull();
    expect(decodeConnectionKey("seo_live_abc")).toBeNull();
  });
});
