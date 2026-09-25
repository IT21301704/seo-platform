import { lookup as dnsLookup } from "node:dns";
import type { LookupAddress, LookupOptions } from "node:dns";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { FetchError } from "./types";

/**
 * SSRF guard (CLAUDE.md rule 7). Only public unicast addresses are allowed: private, loopback,
 * link-local (incl. cloud metadata 169.254.169.254), CGNAT, multicast, reserved and unique-local
 * ranges are blocked. IPv4-mapped IPv6 addresses are checked as IPv4.
 */
export function isBlockedAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return true;
  let parsed = ipaddr.parse(address);
  if (parsed.kind() === "ipv6") {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) parsed = v6.toIPv4Address();
  }
  return parsed.range() !== "unicast";
}

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal", "metadata"]);

/** Throws FetchError("blocked") unless the URL is http(s) to a hostname that may be public. */
export function assertSafeUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new FetchError("invalid-url", `Invalid URL: ${rawUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchError("blocked", `Only http and https are allowed: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new FetchError("blocked", "URLs with credentials are not allowed");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new FetchError("blocked", `Blocked host: ${host}`);
  }
  if (isIP(host) !== 0 && isBlockedAddress(host)) {
    throw new FetchError("blocked", `Blocked address: ${host}`);
  }
  return url;
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * DNS lookup used for every outbound connection. It runs at connect time, so the checked IP is
 * the IP we connect to (no DNS-rebinding gap), and it runs again for every redirect hop.
 */
export function guardedLookup(
  hostname: string,
  options: LookupOptions,
  callback: LookupCallback,
): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const blocked = addresses.find((a) => isBlockedAddress(a.address));
    if (blocked) {
      const error: NodeJS.ErrnoException = new Error(
        `SSRF guard: ${hostname} resolves to blocked address ${blocked.address}`,
      );
      error.code = "ESSRFBLOCKED";
      return callback(error, []);
    }
    if (options.all) return callback(null, addresses);
    const first = addresses[0];
    if (!first) return callback(new Error(`No addresses for ${hostname}`), []);
    callback(null, first.address, first.family);
  });
}
