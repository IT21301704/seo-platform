// Phase 2 integration tests against the Docker Postgres (skipped when it is not reachable).
import { randomBytes } from "node:crypto";
import { PlaywrightRenderer } from "@seo/crawler/playwright";
import { createPrismaClient, forOrganization } from "@seo/db";
import type { Prisma, PrismaClient, ScopedPrisma } from "@seo/db";
import { RateLimiter, encryptSecret, quotaDay } from "@seo/integrations";
import type { JsonHttp, JsonRequest, JsonResponse } from "@seo/integrations";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCrawl } from "./crawls";
import { loadRootEnv } from "./env";
import { inspectionCounterKey, inspectionQuota, syncGoogle } from "./google-sync";
import type { Mailer } from "./notify";
import { registerRules } from "./persist";
import { runPipeline } from "./pipeline";
import { schedulerTick } from "./scheduler";
import { newCheckId, runSitemapCheck } from "./sitemap-check";
import { MemoryBlobStore } from "./storage";
import { sendDelivery, verifySignature } from "./webhooks";

loadRootEnv();
process.env["ENCRYPTION_KEY"] ||= randomBytes(32).toString("hex");
const url = process.env["DATABASE_URL"];
const prisma = url ? createPrismaClient(url) : null;
const available = prisma
  ? await prisma.$queryRaw`SELECT 1`.then(
      () => true,
      () => false,
    )
  : false;

class RecordingHttp implements JsonHttp {
  readonly requests: JsonRequest[] = [];
  async send<T>(req: JsonRequest): Promise<JsonResponse<T>> {
    this.requests.push(req);
    return { status: 200, body: {} as T };
  }
}

describe.skipIf(!available)("Phase 2 worker flows (Postgres)", () => {
  const client = prisma as PrismaClient;
  let orgId = "";
  let projectId = "";
  let db: ScopedPrisma;
  const now = new Date("2026-09-25T10:00:00Z");
  const blobs = new MemoryBlobStore();
  const renderers: PlaywrightRenderer[] = [];
  const mail: { to: string[]; subject: string }[] = [];
  const mailer: Mailer = {
    async send(to, subject) {
      mail.push({ to, subject });
    },
  };
  const http = new RecordingHttp();
  const noWait = new RateLimiter(
    600,
    async () => undefined,
    () => 0,
  );

  const audit = async (fixture: string) => {
    const crawl = await createCrawl(db, { projectId, inputType: "url" });
    const report = await runPipeline(crawl.id, {
      prisma: client,
      db,
      blobs,
      llm: null,
      progress: null,
      makeRenderer: (fetcher) => {
        const r = new PlaywrightRenderer(fetcher);
        renderers.push(r);
        return r;
      },
      now: () => now,
      fixture: { name: fixture },
      alerts: { http, mailer, appUrl: "http://app.test" },
    });
    return { report, crawl: await db.crawl.findUniqueOrThrow({ where: { id: crawl.id } }) };
  };

  beforeAll(async () => {
    await registerRules(client);
    orgId = (
      await client.organization.create({ data: { name: `p2-${randomBytes(4).toString("hex")}` } })
    ).id;
    db = forOrganization(client, orgId);
    await db.user.create({
      data: {
        email: `owner-${orgId}@example-store.com`,
        role: "owner",
      } as Prisma.UserUncheckedCreateInput,
    });
    projectId = (
      await db.project.create({
        data: {
          name: "example-store.com",
          rootUrl: "https://example-store.com/",
          country: "LK",
          language: "en",
          pageLimit: 1000,
          verificationToken: "x",
          timezone: "Asia/Colombo",
        } as Prisma.ProjectUncheckedCreateInput,
      })
    ).id;
    for (const type of ["gsc", "ga4"] as const) {
      await db.integration.create({
        data: {
          projectId,
          type,
          provider: "demo",
          status: "connected",
          externalId: type === "gsc" ? "sc-domain:example-store.com" : "properties/000000000",
        } as Prisma.IntegrationUncheckedCreateInput,
      });
    }
    await db.alertChannel.create({
      data: {
        projectId,
        type: "email",
        target: "alerts@example-store.com",
      } as Prisma.AlertChannelUncheckedCreateInput,
    });
  });

  afterAll(async () => {
    await Promise.all(renderers.map((r) => r.close()));
    await client.organization.deleteMany({ where: { id: orgId } });
    await client.$disconnect();
  });

  it("syncs Search Console, GA4 and URL inspections within the daily quota", async () => {
    await audit("golden-site");
    const result = await syncGoogle(projectId, { db, http, now: () => now, limiter: noWait });
    expect(result.errors).toEqual([]);
    expect(result.gscSnapshotId).not.toBeNull();
    expect(result.ga4SnapshotId).not.toBeNull();
    expect(result.inspected).toBe(14);
    expect(await inspectionQuota(db, projectId, now)).toEqual({
      used: 14,
      remaining: 1986,
      day: quotaDay(now),
    });
    // Same day again: every URL is fresh, so nothing is re-inspected.
    expect(
      (await syncGoogle(projectId, { db, http, now: () => now, limiter: noWait })).inspected,
    ).toBe(0);
  });

  it("never exceeds 2,000 inspections per site per day", async () => {
    await db.urlInspection.deleteMany({ where: { projectId } });
    await db.usageCounter.updateMany({
      where: { key: inspectionCounterKey(projectId) },
      data: { count: 1997 },
    });
    const result = await syncGoogle(projectId, { db, http, now: () => now, limiter: noWait });
    expect(result.inspected).toBe(3);
    expect(result.quotaRemaining).toBe(0);
  });

  it("feeds the dated GSC snapshot into the audit (SMP-003/013/014 apply)", async () => {
    await syncGoogle(projectId, {
      db,
      http,
      now: () => new Date(now.getTime() + 8 * 86_400_000),
      limiter: noWait,
    });
    const { report, crawl } = await audit("golden-site");
    expect(crawl.gscSnapshotId).not.toBeNull();
    const status = (id: string) => report.rules.find((r) => r.ruleId === id)?.status;
    expect(status("SMP-003")).toBe("pass");
    expect(status("SMP-013")).toBe("pass");
    expect(status("SMP-014")).not.toBe("na");
  }, 120_000);

  it("runs a sitemap check: files, URL lists, summary and sitemap-sourced issues", async () => {
    const id = newCheckId();
    await db.sitemapCheck.create({
      data: {
        id,
        projectId,
        crawlerVersion: "",
        rulesetVersion: "",
      } as Prisma.SitemapCheckUncheckedCreateInput,
    });
    await runSitemapCheck(id, {
      prisma: client,
      db,
      blobs,
      now: () => now,
      fixture: { name: "broken-sitemap" },
    });
    const check = await db.sitemapCheck.findUniqueOrThrow({
      where: { id },
      include: { files: true, urls: true },
    });
    expect(check).toMatchObject({
      status: "completed",
      rulesetVersion: "1.1.0",
      sitemapsCount: 1,
      urlsToRemove: 2,
      manualUrls: 0,
    });
    expect(
      check.urls
        .filter((u) => u.listType === "remove")
        .map((u) => u.url)
        .sort(),
    ).toEqual([
      "https://example-store.com/blog/old-post/",
      "https://example-store.com/policies/privacy/",
    ]);
    expect(check.gsc).toMatchObject({ inspected: expect.any(Number) });
    const smpIssues = await db.issue.findMany({
      where: { projectId, ruleId: { startsWith: "SMP-" }, openCount: { gt: 0 } },
    });
    expect(smpIssues.every((i) => i.source === "sitemap_api")).toBe(true);
    expect(smpIssues.map((i) => i.ruleId)).toEqual(
      expect.arrayContaining(["SMP-002", "SMP-007", "SMP-008", "SMP-011"]),
    );
  }, 120_000);

  it("records monitoring events and emails an alert when pages become noindex", async () => {
    mail.length = 0;
    const { crawl } = await audit("broken-indexing");
    const events = await db.monitoringEvent.findMany({ where: { crawlId: crawl.id } });
    expect(events.map((e) => e.type)).toContain("became_noindex");
    expect(mail.some((m) => m.subject.includes("became noindex"))).toBe(true);
    expect(
      await db.alert.count({ where: { projectId, ruleType: "noindex", status: "sent" } }),
    ).toBe(1);
    expect(await db.notification.count({ where: { type: "alert" } })).toBeGreaterThan(0);
  }, 120_000);

  it("queues scheduled crawls and the daily Google sync at local times", async () => {
    await db.project.update({
      where: { id: projectId },
      data: { crawlFrequency: "weekly", nextCrawlAt: new Date(now.getTime() - 60_000) },
    });
    const audits: string[] = [];
    const syncs: string[] = [];
    const tick = await schedulerTick({
      prisma: client,
      now: () => now, // 15:30 in Colombo: after 02:00, so the daily sync is due
      enqueue: {
        audit: async (d) => void audits.push(d.crawlId),
        googleSync: async (d, key) => void syncs.push(`${d.projectId}:${key}`),
      },
    });
    expect(tick.crawlsQueued).toEqual(audits);
    expect(audits).toHaveLength(1);
    expect((await db.crawl.findUniqueOrThrow({ where: { id: audits[0] ?? "" } })).trigger).toBe(
      "scheduled",
    );
    expect(
      (await db.project.findUniqueOrThrow({ where: { id: projectId } })).nextCrawlAt?.toISOString(),
    ).toBe("2026-09-27T20:30:00.000Z");
    await db.crawl.update({ where: { id: audits[0] ?? "" }, data: { status: "cancelled" } });
  });

  it("delivers signed webhooks", async () => {
    const secret = "whsec_test";
    const hook = await db.webhook.create({
      data: {
        projectId,
        url: "https://hooks.example-store.com/seo",
        encryptedSecret: encryptSecret(secret),
        events: ["sitemap.check.completed"],
      } as Prisma.WebhookUncheckedCreateInput,
    });
    const id = newCheckId();
    await db.sitemapCheck.create({
      data: {
        id,
        projectId,
        crawlerVersion: "",
        rulesetVersion: "",
      } as Prisma.SitemapCheckUncheckedCreateInput,
    });
    const [deliveryId] = await runSitemapCheck(id, {
      prisma: client,
      db,
      blobs,
      now: () => now,
      fixture: { name: "golden-site" },
    });
    const recorder = new RecordingHttp();
    await sendDelivery(db, deliveryId ?? "", { http: recorder, now: () => now });
    const req = recorder.requests[0];
    expect(req?.url).toBe(hook.url);
    expect(req?.headers?.["x-seo-event"]).toBe("sitemap.check.completed");
    expect(
      verifySignature(
        secret,
        req?.headers?.["x-seo-signature"] ?? "",
        JSON.stringify(req?.json),
        Math.floor(now.getTime() / 1000),
      ),
    ).toBe(true);
    expect((req?.json as { data: { checkId: string } }).data.checkId).toBe(id);
    expect(
      (await db.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId ?? "" } })).status,
    ).toBe("delivered");
  }, 120_000);
});
