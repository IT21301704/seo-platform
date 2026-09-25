// Integration test against the Docker Postgres (skipped when it is not reachable).
import { randomBytes } from "node:crypto";
import { PlaywrightRenderer } from "@seo/crawler/playwright";
import { createPrismaClient, forOrganization } from "@seo/db";
import type { PrismaClient } from "@seo/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCrawl } from "./crawls";
import { loadRootEnv } from "./env";
import { registerRules } from "./persist";
import { runPipeline } from "./pipeline";
import type { PipelineDeps } from "./pipeline";
import { MemoryBlobStore } from "./storage";

loadRootEnv();
const url = process.env["DATABASE_URL"];

async function reachable(prisma: PrismaClient): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

const prisma = url ? createPrismaClient(url) : null;
const available = prisma ? await reachable(prisma) : false;

describe.skipIf(!available)("audit pipeline (Postgres)", () => {
  const client = prisma as PrismaClient;
  let orgId = "";
  let otherOrgId = "";
  let projectId = "";
  const blobs = new MemoryBlobStore();
  const renderers: PlaywrightRenderer[] = [];

  const deps = (fixture: string): PipelineDeps => ({
    prisma: client,
    db: forOrganization(client, orgId),
    blobs,
    llm: null,
    progress: null,
    makeRenderer: (fetcher) => {
      const r = new PlaywrightRenderer(fetcher);
      renderers.push(r);
      return r;
    },
    now: () => new Date("2026-09-25T00:00:00Z"),
    fixture: { name: fixture },
  });

  async function audit(fixture: string) {
    const db = forOrganization(client, orgId);
    const crawl = await createCrawl(db, { projectId, inputType: "url" });
    const report = await runPipeline(crawl.id, deps(fixture));
    return { crawlId: crawl.id, report, crawl: await db.crawl.findUniqueOrThrow({ where: { id: crawl.id } }) };
  }

  beforeAll(async () => {
    await registerRules(client);
    const suffix = randomBytes(4).toString("hex");
    orgId = (await client.organization.create({ data: { name: `test-${suffix}` } })).id;
    otherOrgId = (await client.organization.create({ data: { name: `other-${suffix}` } })).id;
    const db = forOrganization(client, orgId);
    projectId = (
      await db.project.create({
        data: { name: "t", rootUrl: "https://example-store.com/", country: "LK", language: "en", pageLimit: 1000, verificationToken: "x" } as Parameters<typeof db.project.create>[0]["data"],
      })
    ).id;
  });

  afterAll(async () => {
    await Promise.all(renderers.map((r) => r.close()));
    await client.organization.deleteMany({ where: { id: { in: [orgId, otherOrgId] } } });
    await client.$disconnect();
  });

  it("audits the golden site: 100, versions stored, no issues", async () => {
    const { report, crawl } = await audit("golden-site");
    expect(report.score.health).toBe(100);
    expect(crawl).toMatchObject({ status: "completed", healthScore: 100, rulesetVersion: "1.0.0", llmModelId: "template" });
    expect(crawl.snapshotSetHash).toMatch(/^[a-f0-9]{64}$/);
    const db = forOrganization(client, orgId);
    expect(await db.issue.count({ where: { projectId } })).toBe(0);
    expect(await db.checkResult.count({ where: { crawlId: crawl.id } })).toBeGreaterThan(500);
  }, 120_000);

  it("tracks issue items across audits: new → resolved", async () => {
    const db = forOrganization(client, orgId);
    const broken = await audit("broken-onpage");
    expect(broken.report.score.health).toBe(99);
    const items = await db.issueItem.findMany({ where: { projectId }, orderBy: { stableKey: "asc" } });
    expect(items.map((i) => [i.stableKey, i.auditTag, i.status])).toEqual([
      ["ONP-002|https://example-store.com/products/blue-ceramic-mug/", "new", "open"],
      ["ONP-002|https://example-store.com/products/speckled-stoneware-mug/", "new", "open"],
      ["ONP-004|https://example-store.com/about/", "new", "open"],
      ["ONP-005|https://example-store.com/blog/care-guide/", "new", "open"],
      ["ONP-008|https://example-store.com/collections/mugs/", "new", "open"],
    ]);
    // Explanations were cached (template: no API key in tests).
    expect(await db.llmOutput.count()).toBe(4);

    await audit("golden-site");
    const after = await db.issueItem.findMany({ where: { projectId } });
    expect(after.every((i) => i.auditTag === "resolved" && i.status === "verified")).toBe(true);
    expect((await db.issue.findMany({ where: { projectId } })).every((i) => i.openCount === 0)).toBe(true);
  }, 180_000);

  it("reuses the earlier report when the site and versions are unchanged", async () => {
    const first = await client.crawl.findFirstOrThrow({ where: { projectId, healthScore: 100 }, orderBy: { createdAt: "asc" } });
    const again = await audit("golden-site");
    expect(again.crawl.reusedFromCrawlId).not.toBeNull();
    expect(again.crawl.reportHash).toBe(first.reportHash);
  }, 120_000);

  it("isolates tenants: another organization cannot see these crawls", async () => {
    const other = forOrganization(client, otherOrgId);
    expect(await other.crawl.count()).toBe(0);
    const anyCrawl = await client.crawl.findFirstOrThrow({ where: { projectId } });
    expect(await other.crawl.findUnique({ where: { id: anyCrawl.id } })).toBeNull();
  });
});
