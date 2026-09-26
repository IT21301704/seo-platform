import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";

/** Home: open the most recently created project, or onboarding when there is none. */
export default async function HomePage() {
  const { db } = await requireUser();
  const project = await db.project.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  redirect(project ? `/projects/${project.id}` : "/onboarding");
}
