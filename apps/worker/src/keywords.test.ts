// Keyword research worker flow (M18) against the Docker Postgres (skipped when not reachable).
import { createPrismaClient, forOrganization } from "@seo/db";
import type { Prisma, PrismaClient, ScopedPrisma } from "@seo/db";
import { DemoGscApi } from "@seo/integrations";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadRootEnv } from "./env";
import { refreshKeywords, saveKeywordSnapshot } from "./keywords";

loadRootEnv();
const url = process.env["DATABASE_URL"];
const prisma = url ? createPrismaClient(url) : null;
const available = prisma
  ? await prisma.$queryRaw`SELECT 1`.then(
      () => true,
      () => false,
    )
  : false;

const ORIGIN = "https://example-store.com";
const PAGES = [
  "/",
  "/about/",
  "/services/",
  "/collections/mugs/",
  "/products/gift-set/",
  "/blog/care-guide/",
].map((p) => `${ORIGIN}${p}`);

const mapOf = (db: ScopedPrisma, projectId: string) =>
  db.keywordPageMap.findMany({
    where: { projectId },
    orderBy: [{ url: "asc" }, { keyword: "asc" }],
    select: { url: true, keyword: true, role: true, source: true },
  });

describe.skipIf(!available)("keyword research (Postgres)", () => {
  const client = prisma as PrismaClient;
  let orgId = "";
  let projectId = "";
  let db: ScopedPrisma;
  const now = new Date("2026-09-24T06:00:00Z");

  beforeAll(async () => {
    const org = await client.organization.create({ data: { name: `kw-test ${Date.now()}` } });
    orgId = org.id;
    db = forOrganization(client, orgId);
    const project = await db.project.create({
      data: {
        name: "example-store.com",
        rootUrl: `${ORIGIN}/`,
        country: "LK",
        language: "en",
        pageLimit: 100,
        verificationToken: "seo-verify=test",
      } as unknown as Prisma.ProjectUncheckedCreateInput,
    });
    projectId = project.id;
    const api = new DemoGscApi(
      ORIGIN,
      async () => PAGES,
      async () => [],
      () => now,
    );
    await saveKeywordSnapshot(db, {
      projectId,
      provider: "demo",
      siteUrl: "sc-domain:example-store.com",
      range: { startDate: "2026-08-25", endDate: "2026-09-21" },
      api,
      now,
    });
  });

  afterAll(async () => {
    await client.organization.deleteMany({ where: { id: orgId } });
    await client.$disconnect();
  });

  it("stores a dated, sorted query snapshot and builds clusters without an LLM", async () => {
    const result = await refreshKeywords(projectId, { db, llm: null, now: () => now });
    expect(result.clusters).toBeGreaterThan(0);
    const snapshot = await db.keywordSnapshot.findFirstOrThrow({ where: { projectId } });
    expect(snapshot.endDate).toBe("2026-09-21");
    const queries = (snapshot.rows as { query: string }[]).map((r) => r.query);
    expect(queries).toEqual([...queries].sort((a, b) => a.localeCompare(b)));
    expect(snapshot.clusters).toMatchObject({ source: "words", modelId: null });
  });

  it("writes KWD-002 for competing pages to the issue manager (source keywords)", async () => {
    const issue = await db.issue.findFirstOrThrow({ where: { projectId, ruleId: "KWD-002" } });
    expect(issue.source).toBe("keywords");
    const items = await db.issueItem.findMany({ where: { projectId, ruleId: "KWD-002" } });
    expect(items.length).toBeGreaterThanOrEqual(1);
    for (const item of items) {
      expect(Array.isArray((item.evidence as { keywords?: unknown }).keywords)).toBe(true);
    }
  });

  it("keeps the owner's map entries when the automatic map refreshes", async () => {
    await db.keywordPageMap.create({
      data: {
        organizationId: orgId,
        projectId,
        url: `${ORIGIN}/about/`,
        keyword: "handmade pottery studio sri lanka",
        role: "primary",
        source: "user",
      } as Prisma.KeywordPageMapUncheckedCreateInput,
    });
    await refreshKeywords(projectId, { db, llm: null, now: () => now });
    const about = await db.keywordPageMap.findMany({
      where: { projectId, url: `${ORIGIN}/about/` },
    });
    expect(about).toEqual([
      expect.objectContaining({ keyword: "handmade pottery studio sri lanka", source: "user" }),
    ]);
    expect(
      await db.keywordPageMap.count({ where: { projectId, source: "auto", role: "primary" } }),
    ).toBeGreaterThan(0);
  });

  it("is deterministic: the same snapshot gives the same map", async () => {
    const before = await mapOf(db, projectId);
    await refreshKeywords(projectId, { db, llm: null, now: () => now });
    expect(await mapOf(db, projectId)).toEqual(before);
  });
});
