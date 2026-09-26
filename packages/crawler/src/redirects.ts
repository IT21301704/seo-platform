import { FetchError } from "./types";
import type { FetchResponse, Fetcher, RedirectHop, ResourceRecord } from "./types";
import { normalizeUrl } from "./url";

export const MAX_REDIRECT_HOPS = 10;

export interface FollowedResponse {
  record: ResourceRecord;
  /** The final non-redirect response, or null on error/loop/too many hops. */
  response: FetchResponse | null;
}

/**
 * Fetches a URL and follows redirects hop by hop. Each hop goes through the fetcher, so the
 * SSRF guard re-checks every redirect target.
 */
export async function fetchWithRedirects(
  fetcher: Fetcher,
  url: string,
  method: "GET" | "HEAD" = "GET",
): Promise<FollowedResponse> {
  const chain: RedirectHop[] = [];
  const visited = new Set<string>();
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    if (visited.has(current))
      return { record: failure(url, chain, current, null, true), response: null };
    visited.add(current);

    let response: FetchResponse;
    try {
      response = await fetcher.fetch({ url: current, method });
    } catch (error) {
      const err = error instanceof FetchError ? error : new FetchError("network", String(error));
      return {
        record: failure(url, chain, current, `${err.code}: ${err.message}`, false),
        response: null,
      };
    }

    const location = response.headers["location"];
    if (response.status >= 300 && response.status < 400 && location) {
      const next = normalizeUrl(location, current);
      chain.push({ url: current, status: response.status, location: next ?? location });
      if (!next) {
        return {
          record: failure(url, chain, current, "invalid-url: bad Location header", false),
          response: null,
        };
      }
      current = next;
      continue;
    }

    return {
      record: {
        url,
        chain,
        finalUrl: current,
        status: response.status,
        headers: response.headers,
        contentType: response.headers["content-type"] ?? null,
        bodySize: response.bodySize,
        error: null,
        loop: false,
      },
      response,
    };
  }
  return {
    record: failure(
      url,
      chain,
      current,
      `network: more than ${MAX_REDIRECT_HOPS} redirects`,
      false,
    ),
    response: null,
  };
}

function failure(
  url: string,
  chain: RedirectHop[],
  finalUrl: string,
  error: string | null,
  loop: boolean,
): ResourceRecord {
  return {
    url,
    chain,
    finalUrl,
    status: null,
    headers: {},
    contentType: null,
    bodySize: 0,
    error: loop ? "loop: redirect loop" : error,
    loop,
  };
}
