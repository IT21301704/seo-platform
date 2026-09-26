import { randomBytes } from "node:crypto";
import { forOrganization } from "@seo/db";
import type { Prisma } from "@seo/db";
import { authorizationUrl, encryptSecret } from "@seo/integrations";
import { enqueueGoogleSync } from "@seo/worker/queue";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { OAUTH_COOKIE, appUrl, demoGoogleAllowed, isGoogleType, oauthClient } from "@/lib/google";

/** Starts connecting Search Console or GA4 for a project. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") ?? "";
  const type = url.searchParams.get("type") ?? "";
  const back = url.searchParams.get("back") ?? "sitemap";
  const session = await auth();
  const user = session?.user?.id
    ? await prisma.user.findUnique({ where: { id: session.user.id } })
    : null;
  if (!user) return Response.redirect(`${appUrl()}/signin`, 302);
  if (user.role === "viewer" || !isGoogleType(type))
    return new Response("Forbidden", { status: 403 });
  const db = forOrganization(prisma, user.organizationId);
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) return new Response("Not found", { status: 404 });
  const returnTo = `${appUrl()}/projects/${project.id}/${back === "monitoring" ? "monitoring" : "sitemap"}`;

  const client = oauthClient();
  if (!client) {
    if (!demoGoogleAllowed()) return Response.redirect(`${returnTo}?google=not-configured`, 302);
    // Local development: a clearly labelled demo connection with sample data.
    const data = {
      provider: "demo" as const,
      status: "connected" as const,
      externalId:
        type === "gsc" ? `sc-domain:${new URL(project.rootUrl).hostname}` : "properties/000000000",
      externalName:
        type === "gsc"
          ? `${new URL(project.rootUrl).hostname} (demo data)`
          : "Demo GA4 property (demo data)",
      encryptedToken: null,
      scopes: [],
      connectedById: user.id,
      error: null,
    };
    await db.integration.upsert({
      where: { projectId_type: { projectId: project.id, type } },
      create: {
        organizationId: user.organizationId,
        projectId: project.id,
        type,
        ...data,
      } as Prisma.IntegrationUncheckedCreateInput,
      update: data,
    });
    await db.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        action: `integration.${type}.connect_demo`,
        entityType: "project",
        entityId: project.id,
        source: "user",
      },
    });
    await enqueueGoogleSync(
      { projectId: project.id, organizationId: user.organizationId },
      `connect-${Date.now()}`,
    );
    return Response.redirect(`${returnTo}?google=connected`, 302);
  }

  const state = randomBytes(24).toString("base64url");
  const jar = await cookies();
  // Encrypted so the project and type cannot be tampered with; expires in 10 minutes.
  jar.set(
    OAUTH_COOKIE,
    encryptSecret(JSON.stringify({ state, projectId: project.id, type, back, userId: user.id })),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: appUrl().startsWith("https://"),
      maxAge: 600,
      path: "/api/integrations/google",
    },
  );
  return Response.redirect(authorizationUrl(client, type, state), 302);
}
