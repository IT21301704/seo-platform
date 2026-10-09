// WordPress plugin connection (REQUIREMENTS M13): connection keys, the signed client and the
// "Check connection" handshake that also proves domain ownership.
import type { Prisma, ScopedPrisma } from "@seo/db";
import {
  PLUGIN_API_VERSION,
  WordPressClient,
  decryptSecret,
  encodeConnectionKey,
  encryptSecret,
  newSigningSecret,
} from "@seo/integrations";
import type { JsonHttp, WpStatus } from "@seo/integrations";

export type Integration = Awaited<ReturnType<ScopedPrisma["integration"]["findFirstOrThrow"]>>;

/**
 * Creates (or replaces) the project's WordPress connection and returns the connection key to
 * paste into the plugin. The secret is stored encrypted and never shown again.
 */
export async function createWordPressConnection(
  db: ScopedPrisma,
  args: { projectId: string; organizationId: string; userId: string; appUrl: string },
): Promise<{ key: string; integration: Integration }> {
  const secret = newSigningSecret();
  const data = {
    provider: "plugin" as const,
    status: "needs_property" as const,
    encryptedToken: encryptSecret(secret),
    scopes: [],
    externalId: null,
    externalName: null,
    connectedById: args.userId,
    error: null,
    details: {},
  };
  const integration = await db.integration.upsert({
    where: { projectId_type: { projectId: args.projectId, type: "wordpress" } },
    create: {
      organizationId: args.organizationId,
      projectId: args.projectId,
      type: "wordpress",
      ...data,
    } as Prisma.IntegrationUncheckedCreateInput,
    update: data,
  });
  return {
    key: encodeConnectionKey({ app: args.appUrl, key: integration.id, secret }),
    integration,
  };
}

export function wordPressClient(
  integration: Pick<Integration, "id" | "encryptedToken">,
  siteUrl: string,
  http: JsonHttp,
  now: () => Date = () => new Date(),
): WordPressClient {
  if (!integration.encryptedToken) throw new Error("WordPress connection has no signing secret");
  return new WordPressClient(
    http,
    { siteUrl, keyId: integration.id, secret: decryptSecret(integration.encryptedToken) },
    now,
  );
}

export const SEO_PLUGIN_NAME: Record<WpStatus["seoPlugin"], string> = {
  yoast: "Yoast SEO",
  rankmath: "Rank Math",
  core: "no SEO plugin",
};

/**
 * Calls the plugin's signed /status. On success the integration is connected and, because only
 * someone with admin access to the site could install the key, the project counts as verified
 * (verification method "plugin").
 */
export async function checkWordPressConnection(
  db: ScopedPrisma,
  projectId: string,
  http: JsonHttp,
  now: () => Date,
): Promise<{ ok: true; status: WpStatus } | { ok: false; error: string }> {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const integration = await db.integration.findFirst({ where: { projectId, type: "wordpress" } });
  if (!integration) return { ok: false, error: "Create a connection key first." };
  let status: WpStatus;
  try {
    status = await wordPressClient(integration, project.rootUrl, http, now).status();
  } catch (error) {
    const message = `The plugin did not answer: ${(error as Error).message.slice(0, 300)}`;
    await db.integration.update({
      where: { id: integration.id },
      data: { status: "error", error: message },
    });
    return { ok: false, error: message };
  }
  if (new URL(status.homeUrl).host !== new URL(project.rootUrl).host) {
    const error = `The plugin answered from ${status.homeUrl}, not ${project.rootUrl}.`;
    await db.integration.update({
      where: { id: integration.id },
      data: { status: "error", error },
    });
    return { ok: false, error };
  }
  if (status.seoPluginReady === false) {
    const error = `${SEO_PLUGIN_NAME[status.seoPlugin]} is active but outputs no SEO tags yet. Finish (or skip the account step of) its setup wizard in WordPress, then check again.`;
    await db.integration.update({
      where: { id: integration.id },
      data: { status: "error", error },
    });
    return { ok: false, error };
  }
  if (status.apiVersion !== PLUGIN_API_VERSION) {
    const error = `Plugin API version ${status.apiVersion} is not supported (expected ${PLUGIN_API_VERSION}). Update the plugin.`;
    await db.integration.update({
      where: { id: integration.id },
      data: { status: "error", error },
    });
    return { ok: false, error };
  }
  await db.integration.update({
    where: { id: integration.id },
    data: {
      status: "connected",
      error: null,
      lastSyncAt: now(),
      externalId: status.homeUrl,
      externalName: `Plugin v${status.pluginVersion} · ${SEO_PLUGIN_NAME[status.seoPlugin]}`,
      details: status as unknown as Prisma.InputJsonValue,
    },
  });
  if (!project.verifiedAt) {
    await db.project.update({
      where: { id: projectId },
      data: { verifiedAt: now(), verificationMethod: "plugin", cmsType: "wordpress" },
    });
  }
  return { ok: true, status };
}
