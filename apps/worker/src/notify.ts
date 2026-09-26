// Delivery of alerts (email, Slack) and in-app notifications.
import type { AlertChannel, AlertRuleType, Prisma, ScopedPrisma } from "@seo/db";
import { decryptSecret, ok } from "@seo/integrations";
import type { JsonHttp } from "@seo/integrations";
import { createTransport } from "nodemailer";

export interface Mailer {
  send(to: string[], subject: string, text: string): Promise<void>;
}

/** SMTP when EMAIL_SERVER is set; otherwise messages are printed to the log (development). */
export function mailerFromEnv(env: NodeJS.ProcessEnv = process.env): Mailer {
  const server = env["EMAIL_SERVER"];
  const from = env["EMAIL_FROM"] ?? "SEO Platform <no-reply@localhost>";
  if (!server) {
    return {
      async send(to, subject, text) {
        console.log(`[email → ${to.join(", ")}] ${subject}\n${text}`);
      },
    };
  }
  const transport = createTransport(server);
  return {
    async send(to, subject, text) {
      await transport.sendMail({ to, from, subject, text });
    },
  };
}

/** Only Slack incoming webhooks are accepted as Slack targets. */
export function isSlackWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      u.hostname === "hooks.slack.com" &&
      u.pathname.startsWith("/services/")
    );
  } catch {
    return false;
  }
}

export async function sendToChannel(
  channel: Pick<AlertChannel, "type" | "target" | "encryptedSecret">,
  subject: string,
  text: string,
  deps: { http: JsonHttp; mailer: Mailer },
): Promise<void> {
  if (channel.type === "email") {
    const to = channel.target
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (to.length) await deps.mailer.send(to, subject, text);
    return;
  }
  if (!channel.encryptedSecret) throw new Error("Slack webhook URL is missing");
  const url = decryptSecret(channel.encryptedSecret);
  if (!isSlackWebhookUrl(url)) throw new Error("Not a Slack incoming-webhook URL");
  ok(
    await deps.http.send({ method: "POST", url, json: { text: `*${subject}*\n${text}` } }),
    "Slack",
  );
}

/** Sends each triggered alert to every enabled channel and logs the result. */
export async function deliverAlerts(
  db: ScopedPrisma,
  projectId: string,
  projectName: string,
  alerts: { type: AlertRuleType; message: string }[],
  deps: { http: JsonHttp; mailer: Mailer; link: string },
): Promise<void> {
  if (!alerts.length) return;
  const channels = await db.alertChannel.findMany({ where: { projectId, enabled: true } });
  for (const alert of alerts) {
    const subject = `[${projectName}] ${alert.message}`;
    const text = `${alert.message}\n\nOpen monitoring: ${deps.link}\n\nWe report changes we measured; rankings and indexing are decided by search engines.`;
    for (const channel of channels) {
      let status = "sent";
      let error: string | null = null;
      try {
        await sendToChannel(channel, subject, text, deps);
      } catch (e) {
        status = "failed";
        error = (e as Error).message.slice(0, 500);
      }
      await db.alert.create({
        data: {
          projectId,
          ruleType: alert.type,
          channel: channel.type,
          status,
          message: alert.message,
          error,
        } as Prisma.AlertUncheckedCreateInput,
      });
    }
  }
  await notifyEditors(db, {
    type: "alert",
    title: `${projectName}: ${alerts.length === 1 ? alerts[0]?.message : `${alerts.length} alerts`}`,
    body: alerts.map((a) => a.message).join("\n"),
    link: deps.link,
  });
}

/** In-app notification for everyone who can act on issues (Owner, Admin, Editor). */
export async function notifyEditors(
  db: ScopedPrisma,
  n: { type: string; title: string; body: string; link: string },
): Promise<void> {
  const users = await db.user.findMany({
    where: { role: { in: ["owner", "admin", "editor"] } },
    select: { id: true },
  });
  if (!users.length) return;
  await db.notification.createMany({
    data: users.map((u) => ({ userId: u.id, ...n })) as Prisma.NotificationCreateManyInput[],
  });
}

export async function notifyUser(
  db: ScopedPrisma,
  userId: string,
  n: { type: string; title: string; body: string; link: string },
): Promise<void> {
  await db.notification.create({
    data: { userId, ...n } as Prisma.NotificationUncheckedCreateInput,
  });
}
