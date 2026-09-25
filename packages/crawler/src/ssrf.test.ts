import { describe, expect, it } from "vitest";
import { HttpFetcher } from "./http-fetcher";
import { assertSafeUrl, guardedLookup, isBlockedAddress } from "./ssrf";
import { FetchError } from "./types";

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.5",
    "172.16.3.4",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1", // CGNAT
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "fc00::1",
    "fd00:ec2::254", // AWS metadata over IPv6
    "fe80::1",
    "::ffff:127.0.0.1", // IPv4-mapped loopback
    "::ffff:10.0.0.1",
    "not-an-ip",
  ])("blocks %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"])("allows public %s", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});

describe("assertSafeUrl", () => {
  it.each([
    "http://127.0.0.1/",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data/",
    "http://localhost:3000/",
    "http://metadata.google.internal/",
    "ftp://example.com/",
    "file:///etc/passwd",
    "https://user:pass@example.com/",
  ])("rejects %s", (url) => {
    expect(() => assertSafeUrl(url)).toThrow(FetchError);
  });

  it("accepts a public https URL", () => {
    expect(assertSafeUrl("https://example-store.com/about/").hostname).toBe("example-store.com");
  });
});

describe("guardedLookup", () => {
  it("rejects hostnames that resolve to loopback", async () => {
    const error = await new Promise<NodeJS.ErrnoException | null>((resolve) => {
      guardedLookup("localhost", {}, (err) => resolve(err));
    });
    expect(error?.code).toBe("ESSRFBLOCKED");
  });
});

describe("HttpFetcher", () => {
  it("refuses private addresses before any request is made", async () => {
    const fetcher = new HttpFetcher();
    await expect(fetcher.fetch({ url: "http://127.0.0.1:9/" })).rejects.toMatchObject({
      code: "blocked",
    });
    await fetcher.close();
  });
});
