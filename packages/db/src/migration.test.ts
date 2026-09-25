import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pkgRoot = fileURLToPath(new URL("..", import.meta.url));
const migrationSql = readFileSync(
  new URL("../prisma/migrations/0001_init/migration.sql", import.meta.url),
  "utf8",
);

const PHASE_0_1_TABLES = [
  "audit_log",
  "check_results",
  "crawls",
  "issue_items",
  "issues",
  "links",
  "llm_outputs",
  "organizations",
  "page_facts",
  "pages",
  "projects",
  "rules",
  "scores",
  "users",
];

describe("initial migration", () => {
  const db = new PGlite();

  beforeAll(async () => {
    await db.exec(migrationSql);
  });

  afterAll(async () => {
    await db.close();
  });

  it("creates every Phase 0–1 table", async () => {
    const { rows } = await db.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    expect(rows.map((r) => r.table_name)).toEqual(PHASE_0_1_TABLES);
  });

  it("scopes every tenant table by organizationId", async () => {
    const { rows } = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'organizationId' ORDER BY table_name`,
    );
    const scoped = rows.map((r) => r.table_name);
    const tenantTables = PHASE_0_1_TABLES.filter((t) => t !== "organizations");
    expect(scoped).toEqual(tenantTables);
  });

  it("stores every version needed to reproduce a crawl", async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'crawls'`,
    );
    const columns = rows.map((r) => r.column_name);
    for (const col of [
      "crawlerVersion",
      "rulesetVersion",
      "weightsVersion",
      "promptVersion",
      "llmModelId",
      "snapshotSetHash",
    ]) {
      expect(columns).toContain(col);
    }
  });

  it("round-trips a crawl row", async () => {
    await db.exec(`
      INSERT INTO organizations (id, name, "updatedAt") VALUES ('org_1', 'Example Store', now());
      INSERT INTO projects (id, "organizationId", name, "rootUrl", country, language, "pageLimit", "updatedAt")
        VALUES ('prj_1', 'org_1', 'example-store.com', 'https://example-store.com/', 'LK', 'en', 1000, now());
      INSERT INTO crawls (id, "organizationId", "projectId", "inputType", "crawlerVersion", "rulesetVersion",
        "weightsVersion", "promptVersion", "llmModelId")
        VALUES ('crw_1', 'org_1', 'prj_1', 'url', '1.0.0', '1.0.0', 'v1', 'v1.0', 'test-model');
    `);
    const { rows } = await db.query<{ status: string }>(
      "SELECT status FROM crawls WHERE id = 'crw_1'",
    );
    expect(rows).toEqual([{ status: "queued" }]);
  });
});

// Valid while 0001_init is the only migration. With more migrations, the CI `db` job
// (migrate deploy + diff against the live database) is the drift check.
describe("schema and migration stay in sync", () => {
  it("migration.sql equals a fresh diff of schema.prisma", () => {
    const fresh = execFileSync(
      process.execPath,
      [
        "node_modules/prisma/build/index.js",
        "migrate",
        "diff",
        "--from-empty",
        "--to-schema",
        "prisma/schema.prisma",
        "--script",
      ],
      { cwd: pkgRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    expect(fresh).toBe(migrationSql);
  }, 60_000);
});
