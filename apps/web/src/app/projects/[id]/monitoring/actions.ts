"use server";

import type { AlertRuleType, Prisma } from "@seo/db";
import { encryptSecret } from "@seo/integrations";
import { isSlackWebhookUrl } from "@seo/worker/notify";
import { nextCrawlAt } from "@seo/worker/schedule";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertCanEdit, logAction, requireProject, requireUser } from "@/lib/session";

export interface FormState {
  ok: boolean;
  message: string;
}

const emails = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => v === "" || v.split(",").every((e) => z.string().email().safeParse(e.trim()).success), "Enter email addresses separated by commas");

/** Saves the email and Slack alert channels. The Slack URL is write-only and stored encrypted. */
export async function saveChannels(projectId: string, _prev: FormState | null, formData: FormData): Promise<FormState> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  const project = await requireProject(db, projectId);
  const email = emails.safeParse(formData.get("emailTargets") ?? "");
  if (!email.success) return { ok: false, message: email.error.issues[0]?.message ?? "Invalid email" };
  const slackUrl = String(formData.get("slackUrl") ?? "").trim();
  if (slackUrl && !isSlackWebhookUrl(slackUrl)) return { ok: false, message: "Use a Slack incoming-webhook URL (https://hooks.slack.com/services/…)" };

  const emailEnabled = formData.get("emailEnabled") === "on";
  await db.alertChannel.upsert({
    where: { projectId_type: { projectId, type: "email" } },
    create: { organizationId: project.organizationId, projectId, type: "email", enabled: emailEnabled, target: email.data || user.email } as Prisma.AlertChannelUncheckedCreateInput,
    update: { enabled: emailEnabled, target: email.data || user.email },
  });
  const existingSlack = await db.alertChannel.findUnique({ where: { projectId_type: { projectId, type: "slack" } } });
  const slackEnabled = formData.get("slackEnabled") === "on";
  const label = String(formData.get("slackChannel") ?? "").trim().slice(0, 80) || "#seo-alerts";
  if (slackUrl || existingSlack) {
    const secret = slackUrl ? encryptSecret(slackUrl) : existingSlack?.encryptedSecret;
    await db.alertChannel.upsert({
      where: { projectId_type: { projectId, type: "slack" } },
      create: { organizationId: project.organizationId, projectId, type: "slack", enabled: slackEnabled, target: label, encryptedSecret: secret } as Prisma.AlertChannelUncheckedCreateInput,
      update: { enabled: slackEnabled, target: label, ...(slackUrl ? { encryptedSecret: secret } : {}) },
    });
  } else if (slackEnabled) {
    return { ok: false, message: "Add the Slack webhook URL to enable Slack alerts" };
  }
  await logAction(db, user, { action: "alerts.channels.update", entityType: "project", entityId: projectId, after: { emailEnabled, slackEnabled } });
  revalidatePath(`/projects/${projectId}/monitoring`);
  return { ok: true, message: "Alert channels saved" };
}

const RULE_TYPES: AlertRuleType[] = ["score_drop", "new_critical", "noindex", "weekly_summary"];

export async function saveRules(projectId: string, _prev: FormState | null, formData: FormData): Promise<FormState> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  const project = await requireProject(db, projectId);
  const threshold = Number(formData.get("threshold") ?? 5);
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 100) return { ok: false, message: "Threshold must be a whole number from 0 to 100" };
  for (const type of RULE_TYPES) {
    const enabled = formData.get(type) === "on";
    await db.alertRule.upsert({
      where: { projectId_type: { projectId, type } },
      create: { organizationId: project.organizationId, projectId, type, enabled, threshold: type === "score_drop" ? threshold : null } as Prisma.AlertRuleUncheckedCreateInput,
      update: { enabled, threshold: type === "score_drop" ? threshold : null },
    });
  }
  await logAction(db, user, { action: "alerts.rules.update", entityType: "project", entityId: projectId });
  revalidatePath(`/projects/${projectId}/monitoring`);
  return { ok: true, message: "Alert rules saved" };
}

const ScheduleSchema = z.object({
  crawlFrequency: z.enum(["manual", "weekly", "daily"]),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone"),
});

export async function saveSchedule(projectId: string, _prev: FormState | null, formData: FormData): Promise<FormState> {
  const { user, db } = await requireUser();
  assertCanEdit(user);
  await requireProject(db, projectId);
  const parsed = ScheduleSchema.safeParse({ crawlFrequency: formData.get("crawlFrequency"), timezone: formData.get("timezone") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid schedule" };
  const next = nextCrawlAt(parsed.data.crawlFrequency, parsed.data.timezone, new Date());
  await db.project.update({ where: { id: projectId }, data: { ...parsed.data, nextCrawlAt: next } });
  await logAction(db, user, { action: "project.schedule.update", entityType: "project", entityId: projectId, after: parsed.data });
  revalidatePath(`/projects/${projectId}/monitoring`);
  return { ok: true, message: next ? "Schedule saved" : "Scheduled crawls turned off" };
}
