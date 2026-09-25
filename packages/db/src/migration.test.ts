import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pkgRoot = fileURLToPath(new URL("..", import.meta.url));
const migrationsDir = new URL("../prisma/migrations/", import.meta.url);
const migrations = readdirSync(migrationsDir)
  .filter((d) => /^\d{4}_/.test(d))
  .sort()
  .map((d) => readFileSync(new URL(`${d}/migration.sql`, migrationsDir), "utf8"));

const TABLES = [
  "accounts",
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
  "reports",
  "rules",
  "scores",
  "sessions",
  "users",
  "verification_tokens",
];
/** Auth.js identity tables belong to a user, not a tenant (docs/decisions.md). */
const NOT_TENANT_SCOPED = ["accounts", "organizations", "sessions", "verification_tokens"];

const CATALOG_SQL = `
  SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns WHERE table_schema = 'public'
  ORDER BY table_name, column_name`;

describe("migrations", () => {
  const db = new PGlite();

  beforeAll(async () => {
    for (const sql of migrations) await db.exec(sql);
  });

  afterAll(async () => {
    await db.close();
  });

  it("create every table", async () => {
    const { rows } = await db.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    expect(rows.map((r) => r.table_name)).toEqual(TABLES);
  });

  it("scope every tenant table by organizationId", async () => {
    const { rows } = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'organizationId' ORDER BY table_name`,
    );
    expect(rows.map((r) => r.table_name)).toEqual(TABLES.filter((t) => !NOT_TENANT_SCOPED.includes(t)));
  });

  it("store every version needed to reproduce a crawl", async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'crawls'`,
    );
    const columns = rows.map((r) => r.column_name);
    for (const col of ["crawlerVersion", "rulesetVersion", "weightsVersion", "promptVersion", "llmModelId", "snapshotSetHash"]) {
      expect(columns).toContain(col);
    }
  });

  it("round-trip a crawl row", async () => {
    await db.exec(`
      INSERT INTO organizations (id, name, "updatedAt") VALUES ('org_1', 'Example Store', now());
      INSERT INTO projects (id, "organizationId", name, "rootUrl", country, language, "pageLimit", "verificationToken", "updatedAt")
        VALUES ('prj_1', 'org_1', 'example-store.com', 'https://example-store.com/', 'LK', 'en', 1000, 'seo-verify=abc', now());
      INSERT INTO crawls (id, "organizationId", "projectId", "inputType", "crawlerVersion", "rulesetVersion",
        "weightsVersion", "promptVersion", "llmModelId")
        VALUES ('crw_1', 'org_1', 'prj_1', 'url', '1.0.0', '1.0.0', 'v1', 'v1.0', 'test-model');
    `);
    const { rows } = await db.query<{ status: string }>("SELECT status FROM crawls WHERE id = 'crw_1'");
    expect(rows).toEqual([{ status: "queued" }]);
  });

  it("match a fresh build of schema.prisma (no drift)", async () => {
    const fresh = execFileSync(
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.prisma", "--script"],
      { cwd: pkgRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const expected = new PGlite();
    await expected.exec(fresh);
    const [a, b] = await Promise.all([db.query(CATALOG_SQL), expected.query(CATALOG_SQL)]);
    await expected.close();
    expect(a.rows).toEqual(b.rows);
  }, 60_000);
});
