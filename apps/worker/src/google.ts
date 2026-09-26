// Builds Search Console / GA4 clients for a project's integrations (real Google or demo data).
import type { Integration, ScopedPrisma } from "@seo/db";
import {
  DemoGa4Api,
  DemoGscApi,
  GoogleGa4Api,
  GoogleGscApi,
  decryptSecret,
  encryptSecret,
  freshTokens,
} from "@seo/integrations";
import type { Ga4Api, GscApi, JsonHttp, StoredTokens } from "@seo/integrations";

export function googleClientConfig(
  env: NodeJS.ProcessEnv = process.env,
): { clientId: string; clientSecret: string } | null {
  const clientId = env["GOOGLE_CLIENT_ID"];
  const clientSecret = env["GOOGLE_CLIENT_SECRET"];
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** Access-token provider that refreshes when needed and stores the refreshed token encrypted. */
function tokenProvider(
  db: ScopedPrisma,
  http: JsonHttp,
  integration: Integration,
  now: () => Date,
): () => Promise<string> {
  let tokens: StoredTokens | null = null;
  return async () => {
    const client = googleClientConfig();
    if (!client) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set");
    if (!integration.encryptedToken) throw new Error("Integration has no token; connect it again");
    tokens ??= JSON.parse(decryptSecret(integration.encryptedToken)) as StoredTokens;
    const fresh = await freshTokens(http, client, tokens, now().getTime());
    if (fresh !== tokens) {
      tokens = fresh;
      await db.integration.update({
        where: { id: integration.id },
        data: { encryptedToken: encryptSecret(JSON.stringify(fresh)) },
      });
    }
    return fresh.accessToken;
  };
}

/** Indexable URLs of the latest completed crawl (demo data is derived from them). */
async function latestUrls(db: ScopedPrisma, projectId: string): Promise<string[]> {
  const crawl = await db.crawl.findFirst({
    where: { projectId, status: "completed" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!crawl) return [];
  const pages = await db.page.findMany({
    where: { crawlId: crawl.id, OR: [{ isIndexable: true }, { discoveredVia: "sitemap" }] },
    select: { url: true },
    orderBy: { url: "asc" },
  });
  return pages.map((p) => p.url);
}

export function gscApiFor(
  db: ScopedPrisma,
  http: JsonHttp,
  integration: Integration,
  rootUrl: string,
  now: () => Date,
): GscApi {
  if (integration.provider === "demo") {
    const origin = new URL(rootUrl).origin;
    return new DemoGscApi(
      origin,
      () => latestUrls(db, integration.projectId),
      async () => [`${origin}/sitemap.xml`],
      now,
    );
  }
  return new GoogleGscApi(http, tokenProvider(db, http, integration, now));
}

export function ga4ApiFor(
  db: ScopedPrisma,
  http: JsonHttp,
  integration: Integration,
  now: () => Date,
): Ga4Api {
  if (integration.provider === "demo")
    return new DemoGa4Api(() => latestUrls(db, integration.projectId));
  return new GoogleGa4Api(http, tokenProvider(db, http, integration, now));
}
