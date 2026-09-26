import type { ReactNode } from "react";
import { Sidebar } from "@/components/sidebar";
import { projectNav } from "@/lib/nav";
import { requireProject, requireUser } from "@/lib/session";
import { hostOf } from "@/lib/utils";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, db } = await requireUser();
  const project = await requireProject(db, id);
  return (
    <div className="flex min-h-screen">
      <Sidebar
        groups={projectNav(project.id)}
        projectName={hostOf(project.rootUrl)}
        user={{ name: user.name ?? user.email, role: user.role }}
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
