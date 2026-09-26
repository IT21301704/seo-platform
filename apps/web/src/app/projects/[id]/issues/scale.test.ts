// Issue manager queries at 50,000 items (REQUIREMENTS M19). Needs the Docker Postgres; skipped otherwise.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { createPrismaClient, forOrganization } from "@seo/db";
import type { Prisma, PrismaClient } from "@seo/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { itemOrder, itemWhere, parseFilters } from "./filters";

const envFile = resolve(process.cwd(), "../../.env");
if (!process.env["DATABASE_URL"] && existsSync(envFile)) process.loadEnvFile(envFile);
const url = process.env["DATABASE_URL"];
const prisma = url ? createPrismaClient(url) : null;
const available = prisma
  ? await prisma.$queryRaw`SELECT 1`.then(
      () => true,
      () => false,
    )
  : false;

const ITEMS = 50_000;
const RULES = [
  "ONP-004",
  "ONP-002",
  "ONP-008",
  "LNK-002",
  "IDX-001",
  "SD-004",
  "SMP-007",
  "TEC-004",
  "AI-005",
  "PRF-001",
];
/** Budget per query; generous so slow CI machines pass, far below a timeout. */
const BUDGET_MS = 2_000;

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const start = performance.now();
  const value = await fn();
  return { ms: performance.now() - start, value };
}

describe.skipIf(!available)(`issue manager with ${ITEMS.toLocaleString("en")} items`, () => {
  const client = prisma as PrismaClient;
  let orgId = "";
  let projectId = "";
  let userId = "";

  beforeAll(async () => {
    orgId = (
      await client.organization.create({
        data: { name: `scale-${randomBytes(4).toString("hex")}` },
      })
    ).id;
    const db = forOrganization(client, orgId);
    userId = (
      await db.user.create({
        data: { organizationId: orgId, email: `scale-${orgId}@example-store.com`, role: "owner" },
      })
    ).id;
    projectId = (
      await db.project.create({
        data: {
          organizationId: orgId,
          name: "example-store.com",
          rootUrl: "https://example-store.com/",
          country: "LK",
          language: "en",
          pageLimit: 50_000,
          verificationToken: "x",
        } as Prisma.ProjectUncheckedCreateInput,
      })
    ).id;
    const issues = await Promise.all(
      RULES.map((ruleId, i) =>
        db.issue.create({
          data: {
            organizationId: orgId,
            projectId,
            ruleId,
            title: ruleId,
            category: ruleId.startsWith("SMP") ? "sitemap" : "onpage",
            severity: i % 2 ? "high" : "medium",
            source: ruleId.startsWith("SMP") ? "sitemap_api" : "site_audit",
            priority: 10 - i,
          },
        }),
      ),
    );
    const now = new Date("2026-09-24T00:00:00Z");
    const rows: Prisma.IssueItemCreateManyInput[] = Array.from({ length: ITEMS }, (_, n) => {
      const issue = issues[n % issues.length] as (typeof issues)[number];
      const page = Math.floor(n / issues.length);
      return {
        organizationId: orgId,
        projectId,
        issueId: issue.id,
        ruleId: issue.ruleId,
        stableKey: `${issue.ruleId}|${page}`,
        url: `https://example-store.com/products/item-${page}/`,
        status: n % 7 === 0 ? "in_progress" : "open",
        auditTag: n % 5 === 0 ? "new" : "still_open",
        assigneeId: n % 3 === 0 ? userId : null,
        firstSeen: new Date(now.getTime() - (n % 30) * 86_400_000),
        lastSeen: now,
      };
    });
    for (let i = 0; i < rows.length; i += 5_000)
      await client.issueItem.createMany({ data: rows.slice(i, i + 5_000) });
    await client.$executeRaw`ANALYZE issue_items`;
  }, 180_000);

  afterAll(async () => {
    await client.organization.deleteMany({ where: { id: orgId } });
    await client.$disconnect();
  });

  it("serves every view's queries within budget", async () => {
    const db = forOrganization(client, orgId);
    for (const query of [
      {},
      { severity: "high" },
      { assignee: "me", new: "1" },
      { q: "/products/item-4" },
      { source: "sitemap_api", sort: "url" },
    ]) {
      const f = parseFilters(query);
      const where = itemWhere(projectId, f, userId);
      const grouped = await timed(() =>
        db.issueItem.groupBy({ by: ["issueId"], where, _count: { _all: true } }),
      );
      const flat = await timed(() =>
        db.issueItem.findMany({
          where,
          include: { issue: { select: { title: true, severity: true } } },
          orderBy: itemOrder(f.sort),
          take: 100,
        }),
      );
      const count = await timed(() => db.issueItem.count({ where }));
      const byPage = await timed(() =>
        db.issueItem.groupBy({
          by: ["url"],
          where,
          _count: { _all: true },
          orderBy: [{ _count: { url: "desc" } }, { url: "asc" }],
          take: 20,
        }),
      );
      for (const r of [grouped, flat, count, byPage]) expect(r.ms).toBeLessThan(BUDGET_MS);
      if (Object.keys(query).length === 0) {
        expect(count.value).toBe(ITEMS);
        expect(grouped.value).toHaveLength(RULES.length);
        expect(flat.value).toHaveLength(100);
      }
    }
  }, 120_000);
});
