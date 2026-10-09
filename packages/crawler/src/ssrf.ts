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

/**
 * Local development only: DEV_ALLOW_PRIVATE_HOSTS="localhost:8088,host.docker.internal:8088"
 * lets the worker reach the Docker WordPress test site. Always empty in production.
 */
export function devAllowedHosts(env: NodeJS.ProcessEnv = process.env): Set<string> {
  if (env["NODE_ENV"] === "production") return new Set();
  return new Set(
    (env["DEV_ALLOW_PRIVATE_HOSTS"] ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

function hostWithPort(url: URL): string {
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  return `${url.hostname.toLowerCase()}:${port}`;
}

/** True when the dev allow-list covers this URL (exact host and port). */
export function isDevAllowedUrl(url: URL, env: NodeJS.ProcessEnv = process.env): boolean {
  return devAllowedHosts(env).has(hostWithPort(url));
}

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
  if (isDevAllowedUrl(url)) return url;
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
  // Dev allow-list entries are host:port; at DNS time only the host is known, so any listed
  // host skips the address check (assertSafeUrl already enforced the port).
  const devHost = [...devAllowedHosts()].some((h) => h.split(":")[0] === hostname.toLowerCase());
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const blocked = devHost ? undefined : addresses.find((a) => isBlockedAddress(a.address));
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
