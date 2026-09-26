import "server-only";
import { forOrganization } from "@seo/db";
import type { Prisma, Role, ScopedPrisma } from "@seo/db";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "./db";

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  organizationId: string;
}

/** The signed-in user and a database client scoped to their organization. */
export async function requireUser(): Promise<{ user: CurrentUser; db: ScopedPrisma }> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/signin");
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) redirect("/signin");
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
    },
    db: forOrganization(prisma, user.organizationId),
  };
}

/** Viewers are read-only (REQUIREMENTS A5). */
export const canEdit = (role: Role): boolean => role !== "viewer";

export function assertCanEdit(user: CurrentUser): void {
  if (!canEdit(user.role)) throw new Error("Your role is read-only");
}

/** Loads a project of the user's organization, or 404 (never another tenant's). */
export async function requireProject(db: ScopedPrisma, projectId: string) {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) notFound();
  return project;
}

/** Audit log for every write action (REQUIREMENTS Part I). */
export async function logAction(
  db: ScopedPrisma,
  user: CurrentUser,
  entry: {
    action: string;
    entityType: string;
    entityId: string;
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before,
      after: entry.after,
      source: "user",
    } as Prisma.AuditLogUncheckedCreateInput,
  });
}
