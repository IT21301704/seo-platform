"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";

/** Marks one notification (or all when id is null) as read for the signed-in user. */
export async function markRead(projectId: string, notificationId: string | null): Promise<void> {
  const { user, db } = await requireUser();
  await db.notification.updateMany({
    where: { userId: user.id, readAt: null, ...(notificationId ? { id: notificationId } : {}) },
    data: { readAt: new Date() },
  });
  revalidatePath(`/projects/${projectId}`, "layout");
}
