import { PageBody, PageHeader } from "@/components/page-header";
import { Card, EmptyState, Pill } from "@/components/ui";
import type { Tone } from "@/components/ui";
import { requireProject, requireUser } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";
import { markRead } from "./actions";

const TYPE: Record<string, { label: string; tone: Tone }> = {
  mention: { label: "Mention", tone: "info" },
  assigned: { label: "Assigned", tone: "info" },
  regressed: { label: "Regressed", tone: "high" },
  alert: { label: "Alert", tone: "crit" },
};

/** The signed-in user's notifications (mentions, assignments, regressions, alerts). */
export default async function NotificationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, db } = await requireUser();
  const project = await requireProject(db, id);
  const notifications = await db.notification.findMany({ where: { userId: user.id }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 100 });
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <>
      <PageHeader
        eyebrow={`${unread} unread`}
        title="Notifications"
        actions={
          unread > 0 && (
            <form action={markRead.bind(null, project.id, null)}>
              <button type="submit" className="inline-flex h-9 items-center rounded-lg border border-[#CFCFC8] bg-white px-3 text-sm font-semibold">
                Mark all as read
              </button>
            </form>
          )
        }
      />
      <PageBody>
        {notifications.length === 0 ? (
          <EmptyState title="No notifications">
            <p className="m-0 text-muted">You are notified when someone mentions you, assigns you issues, an issue comes back, or an alert fires.</p>
          </EmptyState>
        ) : (
          <Card className="flex flex-col divide-y divide-line">
            {notifications.map((n) => {
              const type = TYPE[n.type] ?? { label: n.type, tone: "gray" as const };
              return (
                <article key={n.id} className={`flex flex-wrap items-start gap-3 px-5 py-4 ${n.readAt ? "" : "bg-primary-soft"}`}>
                  <Pill tone={type.tone}>{type.label}</Pill>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="m-0 text-sm font-semibold">{n.link ? <a href={n.link}>{n.title}</a> : n.title}</p>
                    {n.body && <p className="m-0 line-clamp-2 text-sm text-muted">{n.body}</p>}
                    <span className="text-xs text-muted">{formatDateTime(n.createdAt)}</span>
                  </div>
                  {!n.readAt && (
                    <form action={markRead.bind(null, project.id, n.id)}>
                      <button type="submit" className="text-sm font-semibold text-primary">
                        Mark as read
                      </button>
                    </form>
                  )}
                </article>
              );
            })}
          </Card>
        )}
      </PageBody>
    </>
  );
}
