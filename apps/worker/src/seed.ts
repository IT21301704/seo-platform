// Seeds example-store.com with six audits of the fixture sites (REQUIREMENTS: use example-store.com
// for seed data). Runs the real pipeline in-process against fixtures, so no network is used.
import { randomBytes } from "node:crypto";
import { PlaywrightRenderer } from "@seo/crawler/playwright";
import { createPrismaClient, forOrganization } from "@seo/db";
import { llmClientFromEnv } from "@seo/llm";
import { createCrawl } from "./crawls";
import { loadRootEnv, requireEnv } from "./env";
import { registerRules } from "./persist";
import { runPipeline } from "./pipeline";
import { S3BlobStore } from "./storage";

loadRootEnv();
const prisma = createPrismaClient(requireEnv("DATABASE_URL"));
const ORG_NAME = "Example Store Ceramics";
const OWNER_EMAIL = process.env["SEED_OWNER_EMAIL"] ?? "owner@example-store.com";

/** Oldest first; the last audit is what the dashboard shows. */
const AUDITS = [
  { fixture: "broken-technical", date: "2026-09-03T04:30:00Z" },
  { fixture: "broken-sitemap", date: "2026-09-08T04:30:00Z" },
  { fixture: "broken-links", date: "2026-09-13T04:30:00Z" },
  { fixture: "broken-indexing", date: "2026-09-18T04:30:00Z" },
  { fixture: "broken-schema", date: "2026-09-22T04:30:00Z" },
  { fixture: "broken-onpage", date: "2026-09-24T05:12:00Z" },
];

await registerRules(prisma);
await prisma.organization.deleteMany({ where: { name: ORG_NAME } });
const org = await prisma.organization.create({ data: { name: ORG_NAME } });
await prisma.user.deleteMany({ where: { email: OWNER_EMAIL } });
await prisma.user.create({ data: { organizationId: org.id, email: OWNER_EMAIL, name: "Store Owner", role: "owner" } });

const db = forOrganization(prisma, org.id);
const project = await db.project.create({
  data: {
    name: "example-store.com",
    rootUrl: "https://example-store.com/",
    country: "LK",
    language: "en",
    crawlFrequency: "weekly",
    pageLimit: 1000,
    cmsType: "static",
    verificationToken: `seo-verify=${randomBytes(12).toString("hex")}`,
    detection: { sitemap: true, sitemapUrls: 14, robots: true, https: true, cms: "static" },
  } as Parameters<typeof db.project.create>[0]["data"],
});

const blobs = S3BlobStore.fromEnv();
const llm = llmClientFromEnv();
for (const audit of AUDITS) {
  const crawl = await createCrawl(db, { projectId: project.id, inputType: "url" });
  await prisma.crawl.update({ where: { id: crawl.id }, data: { createdAt: new Date(audit.date) } });
  const report = await runPipeline(crawl.id, {
    prisma,
    db,
    blobs,
    llm,
    progress: null,
    makeRenderer: (fetcher) => new PlaywrightRenderer(fetcher),
    now: () => new Date(audit.date),
    fixture: { name: audit.fixture, crawledAt: audit.date },
  });
  console.log(`${audit.date.slice(0, 10)}  ${audit.fixture.padEnd(17)} health ${report.score.health}`);
}

console.log(`\nSeeded organization "${ORG_NAME}", owner ${OWNER_EMAIL}, project ${project.id}`);
await prisma.$disconnect();
