import { timingSafeEqual } from "node:crypto";
import { forOrganization } from "@seo/db";
import type { Prisma } from "@seo/db";
import { SCOPES, decryptSecret, encryptSecret, exchangeCode } from "@seo/integrations";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { OAUTH_COOKIE, appUrl, googleHttp, isGoogleType, oauthClient } from "@/lib/google";

interface OAuthState {
  state: string;
  projectId: string;
  type: string;
  back: string;
  userId: string;
}

/** OAuth callback: checks state, stores the tokens encrypted, then asks which property to use. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const jar = await cookies();
  const raw = jar.get(OAUTH_COOKIE)?.value;
  jar.delete({ name: OAUTH_COOKIE, path: "/api/integrations/google" });
  let saved: OAuthState;
  try {
    saved = JSON.parse(decryptSecret(raw ?? "")) as OAuthState;
  } catch {
    return new Response("The connection request expired. Please start again.", { status: 400 });
  }
  const state = url.searchParams.get("state") ?? "";
  const same =
    state.length === saved.state.length &&
    timingSafeEqual(Buffer.from(state), Buffer.from(saved.state));
  const client = oauthClient();
  if (!same || !client || !isGoogleType(saved.type))
    return new Response("Invalid OAuth state", { status: 400 });
  const back = `${appUrl()}/projects/${saved.projectId}/${saved.back === "monitoring" ? "monitoring" : "sitemap"}`;
  const code = url.searchParams.get("code");
  if (!code) return Response.redirect(`${back}?google=denied`, 302);

  const user = await prisma.user.findUnique({ where: { id: saved.userId } });
  if (!user || user.role === "viewer") return new Response("Forbidden", { status: 403 });
  const db = forOrganization(prisma, user.organizationId);
  const project = await db.project.findUnique({ where: { id: saved.projectId } });
  if (!project) return new Response("Not found", { status: 404 });

  const tokens = await exchangeCode(googleHttp(), client, code, Date.now());
  const data = {
    provider: "google" as const,
    status: "needs_property" as const,
    encryptedToken: encryptSecret(JSON.stringify(tokens)),
    scopes: [...SCOPES[saved.type]],
    externalId: null,
    externalName: null,
    connectedById: user.id,
    error: null,
  };
  await db.integration.upsert({
    where: { projectId_type: { projectId: project.id, type: saved.type } },
    create: {
      organizationId: user.organizationId,
      projectId: project.id,
      type: saved.type,
      ...data,
    } as Prisma.IntegrationUncheckedCreateInput,
    update: data,
  });
  await db.auditLog.create({
    data: {
      organizationId: user.organizationId,
      actorId: user.id,
      action: `integration.${saved.type}.authorize`,
      entityType: "project",
      entityId: project.id,
      source: "user",
    },
  });
  return Response.redirect(
    `${appUrl()}/projects/${project.id}/connect/${saved.type}?back=${saved.back}`,
    302,
  );
}
