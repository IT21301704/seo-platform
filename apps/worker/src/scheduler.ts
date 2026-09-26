// Runs every few minutes (M10): scheduled crawls, the daily Google sync (02:00 site time) and the
// Monday weekly summary. Each step is idempotent, so a missed or repeated tick is harmless.
import { forOrganization } from "@seo/db";
import type { Prisma, PrismaClient } from "@seo/db";
import type { JsonHttp } from "@seo/integrations";
import { createCrawl } from "./crawls";
import type { Mailer } from "./notify";
import { sendToChannel } from "./notify";
import { enqueueAudit, enqueueGoogleSync } from "./queue";
import { CRAWL_HOUR, MONDAY, SUMMARY_HOUR, localParts, nextCrawlAt } from "./schedule";

export interface SchedulerDeps {
  prisma: PrismaClient;
  now: () => Date;
  alerts?: { http: JsonHttp; mailer: Mailer; appUrl: string };
  enqueue?: { audit: typeof enqueueAudit; googleSync: typeof enqueueGoogleSync };
}

export interface TickResult {
  crawlsQueued: string[];
  syncsQueued: string[];
  summariesSent: string[];
}

export async function schedulerTick(deps: SchedulerDeps): Promise<TickResult> {
  const now = deps.now();
  const enqueue = deps.enqueue ?? { audit: enqueueAudit, googleSync: enqueueGoogleSync };
  const result: TickResult = { crawlsQueued: [], syncsQueued: [], summariesSent: [] };
  // System task across tenants: read ids unscoped, then act through each organization's scoped client.
  const projects = await deps.prisma.project.findMany({
    select: {
      id: true,
      organizationId: true,
      name: true,
      crawlFrequency: true,
      timezone: true,
      nextCrawlAt: true,
    },
  });

  for (const p of projects) {
    const db = forOrganization(deps.prisma, p.organizationId);

    // Scheduled crawls.
    if (p.crawlFrequency !== "manual") {
      if (!p.nextCrawlAt) {
        await db.project.update({
          where: { id: p.id },
          data: { nextCrawlAt: nextCrawlAt(p.crawlFrequency, p.timezone, now) },
        });
      } else if (p.nextCrawlAt <= now) {
        const running = await db.crawl.findFirst({
          where: { projectId: p.id, status: { notIn: ["completed", "failed", "cancelled"] } },
        });
        if (!running) {
          const crawl = await createCrawl(db, {
            projectId: p.id,
            inputType: "url",
            trigger: "scheduled",
          });
          await enqueue.audit({ crawlId: crawl.id, organizationId: p.organizationId });
          result.crawlsQueued.push(crawl.id);
        }
        await db.project.update({
          where: { id: p.id },
          data: { nextCrawlAt: nextCrawlAt(p.crawlFrequency, p.timezone, now) },
        });
      }
    }

    // Daily Google sync after 02:00 local time, once per local day.
    const local = localParts(now, p.timezone);
    const connected = await db.integration.findMany({
      where: { projectId: p.id, status: "connected" },
      select: { lastSyncAt: true },
    });
    if (connected.length && local.hour >= CRAWL_HOUR) {
      const synced = connected.every(
        (i) => i.lastSyncAt && localParts(i.lastSyncAt, p.timezone).date === local.date,
      );
      if (!synced) {
        await enqueue.googleSync({ projectId: p.id, organizationId: p.organizationId }, local.date);
        result.syncsQueued.push(p.id);
      }
    }

    // Weekly summary: Monday from 08:00 local, once per week.
    if (deps.alerts && local.weekday === MONDAY && local.hour >= SUMMARY_HOUR) {
      const rule = await db.alertRule.findFirst({
        where: { projectId: p.id, type: "weekly_summary", enabled: true },
      });
      const weekAgo = new Date(now.getTime() - 6 * 86_400_000);
      const sent = await db.alert.findFirst({
        where: { projectId: p.id, ruleType: "weekly_summary", createdAt: { gte: weekAgo } },
      });
      if (rule && !sent) {
        await sendWeeklySummary(db, p, now, deps.alerts);
        result.summariesSent.push(p.id);
      }
    }
  }
  return result;
}

type Db = ReturnType<typeof forOrganization>;

async function sendWeeklySummary(
  db: Db,
  project: { id: string; name: string },
  now: Date,
  alerts: NonNullable<SchedulerDeps["alerts"]>,
): Promise<void> {
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const crawls = await db.crawl.findMany({
    where: { projectId: project.id, status: "completed", healthScore: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { healthScore: true, createdAt: true },
  });
  const latest = crawls[0]?.healthScore ?? null;
  const before = crawls.find((c) => c.createdAt <= weekAgo)?.healthScore ?? null;
  const events = await db.monitoringEvent.findMany({
    where: {
      projectId: project.id,
      createdAt: { gte: weekAgo },
      level: { in: ["critical", "alert", "high"] },
    },
    orderBy: { createdAt: "desc" },
  });
  const open = await db.issueItem.count({
    where: {
      projectId: project.id,
      auditTag: { not: "resolved" },
      status: { in: ["open", "in_progress", "reopened", "fixed"] },
    },
  });
  const lines = [
    `Health Score: ${latest ?? "—"}${latest !== null && before !== null ? ` (${latest - before >= 0 ? "+" : ""}${latest - before} vs last week)` : ""}`,
    `Open issue items: ${open}`,
    events.length
      ? `Changes this week:\n${events.map((e) => `- ${e.message}`).join("\n")}`
      : "No new problems this week.",
    `Open monitoring: ${alerts.appUrl}/projects/${project.id}/monitoring`,
  ];
  const channels = await db.alertChannel.findMany({
    where: { projectId: project.id, enabled: true },
  });
  for (const channel of channels) {
    let status = "sent";
    let error: string | null = null;
    try {
      await sendToChannel(
        channel,
        `[${project.name}] Weekly SEO summary`,
        lines.join("\n\n"),
        alerts,
      );
    } catch (e) {
      status = "failed";
      error = (e as Error).message.slice(0, 500);
    }
    await db.alert.create({
      data: {
        projectId: project.id,
        ruleType: "weekly_summary",
        channel: channel.type,
        status,
        message: "Weekly summary",
        error,
      } as Prisma.AlertUncheckedCreateInput,
    });
  }
}
