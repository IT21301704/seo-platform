// Phase 3 proof (REQUIREMENTS J6): apply → verify → rollback on the Docker WordPress site returns
// exactly the original value, with the plugin alone and with Yoast SEO / Rank Math when installed.
// Needs: docker compose up -d, pnpm wp:setup [--seo-plugins], DEV_ALLOW_PRIVATE_HOSTS=localhost:8088.
// Skipped when Postgres or the WordPress plugin is not reachable.
import { randomBytes } from "node:crypto";
import { HttpFetcher } from "@seo/crawler";
import type { CrawlSnapshot, FetchRequest, FetchResponse, Fetcher } from "@seo/crawler";
import { PlaywrightRenderer } from "@seo/crawler/playwright";
import { createPrismaClient, forOrganization } from "@seo/db";
import type { Prisma, PrismaClient, ScopedPrisma } from "@seo/db";
import { GuardedJsonHttp, decodeConnectionKey } from "@seo/integrations";
import type { WpItem, WpValue } from "@seo/integrations";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCrawl } from "./crawls";
import { loadRootEnv } from "./env";
import {
  applyFixBatch,
  approveFixBatch,
  createFixBatch,
  editFixValue,
  generateFixBatch,
  loadSnapshot,
  rollbackFixes,
  verifyFixBatch,
} from "./fixes";
import type { FixDeps } from "./fixes";
import { registerRules } from "./persist";
import { runPipeline } from "./pipeline";
import { MemoryBlobStore } from "./storage";
import { checkWordPressConnection, createWordPressConnection, wordPressClient } from "./wordpress";
import {
  WP_URL,
  installedSeoPlugins,
  setPluginConnection,
  useSeoPlugin,
  wp,
  wpTry,
} from "./wp-cli";

loadRootEnv();
process.env["ENCRYPTION_KEY"] ||= randomBytes(32).toString("hex");
process.env["DEV_ALLOW_PRIVATE_HOSTS"] ||= "localhost:8088";
const ROOT = `${WP_URL}/`;

const dbUrl = process.env["DATABASE_URL"];
const prisma = dbUrl ? createPrismaClient(dbUrl) : null;
const dbUp = prisma
  ? await prisma.$queryRaw`SELECT 1`.then(
      () => true,
      () => false,
    )
  : false;
// 401 = the plugin is active and refuses unsigned requests.
const pluginUp = await fetch(`${WP_URL}/?rest_route=/seo-platform/v1/status`).then(
  (r) => r.status === 401,
  () => false,
);
const available = dbUp && pluginUp;

/** Serves the audit's own (old) HTML for the given URLs: a CDN that still has the old page. */
class StaleFetcher implements Fetcher {
  constructor(
    private readonly snapshot: CrawlSnapshot,
    private readonly stale: Set<string>,
    private readonly live: Fetcher,
  ) {}
  async fetch(req: FetchRequest): Promise<FetchResponse> {
    const page = this.snapshot.pages.find((p) => p.url === req.url);
    if (!page?.rawHtml || !this.stale.has(req.url)) return this.live.fetch(req);
    const body = Buffer.from(page.rawHtml);
    return {
      url: req.url,
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body,
      bodySize: body.length,
    };
  }
}

describe.skipIf(!available)("WordPress plugin: apply → verify → rollback (Docker)", () => {
  const client = prisma as PrismaClient;
  const http = new GuardedJsonHttp();
  const blobs = new MemoryBlobStore();
  const now = () => new Date();
  const renderers: PlaywrightRenderer[] = [];
  let previousConnection: string | null = null;
  let orgId = "";
  let userId = "";
  let projectId = "";
  let db: ScopedPrisma;

  const deps = (extra: Partial<FixDeps> = {}): FixDeps => ({
    db,
    blobs,
    llm: null,
    http,
    now,
    verifyDelays: [],
    ...extra,
  });

  beforeAll(async () => {
    await registerRules(client);
    previousConnection = wpTry(["option", "get", "seo_platform_connection", "--format=json"]);
    const org = await client.organization.create({ data: { name: `wp-test ${Date.now()}` } });
    orgId = org.id;
    const user = await client.user.create({
      data: { organizationId: orgId, email: `wp-${Date.now()}@example.test`, role: "owner" },
    });
    userId = user.id;
    db = forOrganization(client, orgId);
    const project = await db.project.create({
      data: {
        name: "WordPress test site",
        rootUrl: ROOT,
        country: "LK",
        language: "en",
        pageLimit: 50,
        verificationToken: "seo-verify=test",
      } as Prisma.ProjectUncheckedCreateInput,
    });
    projectId = project.id;
    const { key } = await createWordPressConnection(db, {
      projectId,
      organizationId: orgId,
      userId,
      appUrl: "http://host.docker.internal:3000",
    });
    const decoded = decodeConnectionKey(key);
    if (!decoded) throw new Error("bad key");
    setPluginConnection({ app: decoded.app, key: decoded.key, secret: decoded.secret });
  }, 120_000);

  afterAll(async () => {
    useSeoPlugin("core");
    // Give the site back to the dev project's connection.
    if (previousConnection)
      wp([
        "option",
        "update",
        "seo_platform_connection",
        previousConnection,
        "--format=json",
        "--autoload=no",
      ]);
    await client.organization.deleteMany({ where: { id: orgId } });
    for (const r of renderers) await r.close();
    await http.close();
  }, 120_000);

  async function audit(): Promise<string> {
    const crawl = await createCrawl(db, { projectId, inputType: "url" });
    await runPipeline(crawl.id, {
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
      now,
    });
    return crawl.id;
  }

  async function pluginValue(item: WpItem): Promise<WpValue> {
    const integration = await db.integration.findFirstOrThrow({
      where: { projectId, type: "wordpress" },
    });
    const [read] = await wordPressClient(integration, ROOT, http).read([item]);
    expect(read?.error).toBeNull();
    return read?.value ?? null;
  }

  async function firstFailing(
    crawlId: string,
    ruleIds: string[],
  ): Promise<{ ruleId: string; url: string } | null> {
    const report = await db.report.findFirstOrThrow({ where: { crawlId } });
    const rules = (
      report.reportJson as {
        rules: { ruleId: string; outcomes: { url: string | null; result: string }[] }[];
      }
    ).rules;
    const integration = await db.integration.findFirstOrThrow({
      where: { projectId, type: "wordpress" },
    });
    const wpClient = wordPressClient(integration, ROOT, http);
    for (const ruleId of ruleIds) {
      const urls = (rules.find((r) => r.ruleId === ruleId)?.outcomes ?? [])
        .filter((o) => o.result === "fail" && o.url)
        .map((o) => o.url as string);
      for (const url of urls) {
        // Only pages the plugin can change (not category archives).
        const [read] = await wpClient.read([{ field: "title", ref: { url } }]);
        if (!read?.error) return { ruleId, url };
      }
    }
    return null;
  }

  /** Creates and generates a batch for one rule and URL; returns its fixes. */
  async function preview(crawlId: string, ruleId: string, urls: string[]) {
    const batch = await createFixBatch(db, {
      projectId,
      organizationId: orgId,
      ruleId,
      userId,
      crawlId,
      urls,
    });
    await generateFixBatch(batch.id, deps());
    const fixes = await db.fix.findMany({ where: { batchId: batch.id }, orderBy: { url: "asc" } });
    return { batch, fixes };
  }

  async function publish(batchId: string, fixIds: string[], extra: Partial<FixDeps> = {}) {
    await approveFixBatch(batchId, fixIds, userId, deps());
    await applyFixBatch(batchId, deps(extra));
    return db.fixBatch.findUniqueOrThrow({ where: { id: batchId }, include: { fixes: true } });
  }

  const modes = (["core", ...(pluginUp ? installedSeoPlugins() : [])] as const).slice();

  for (const mode of modes) {
    describe(`with ${mode === "core" ? "no SEO plugin" : mode === "yoast" ? "Yoast SEO" : "Rank Math"}`, () => {
      let crawlId = "";

      beforeAll(async () => {
        useSeoPlugin(mode);
        const check = await checkWordPressConnection(db, projectId, http, now);
        expect(check).toMatchObject({ ok: true, status: { seoPlugin: mode } });
        crawlId = await audit();
      }, 300_000);

      it("publishes a description or title, verifies it live and rolls back to exactly the original", async () => {
        // Yoast and Rank Math generate some values themselves; fix whatever the audit found.
        const target = await firstFailing(crawlId, ["ONP-004", "ONP-003", "ONP-002", "ONP-001"]);
        expect(target, "the audit should find a description or title problem").not.toBeNull();
        const { ruleId, url } = target as { ruleId: string; url: string };
        const isDescription = ruleId === "ONP-004";
        const item: WpItem = { field: isDescription ? "description" : "title", ref: { url } };
        const original = await pluginValue(item);
        const { batch, fixes } = await preview(crawlId, ruleId, [url]);
        expect(batch.target).toBe("wordpress");
        const [fix] = fixes;
        expect(fix).toMatchObject({ url, recheck: "Empty", approved: false });

        // Without an AI model the owner types the value; the rule engine re-checks it.
        const run = Date.now() % 100000;
        const text = isDescription
          ? `Meet the small team of potters behind our handmade mugs (${mode} test ${run}).`
          : `Ceramic mug guide ${run} | Example Store`;
        const edited = await editFixValue(fix?.id ?? "", text, userId, deps());
        expect(edited.recheck).toBe("pass");

        const published = await publish(batch.id, [fix?.id ?? ""]);
        expect(published.state).toBe("verified");
        expect(published.fixes[0]).toMatchObject({ state: "verified", oldValueRead: true });
        expect(published.fixes[0]?.oldValue ?? null).toEqual(original);
        expect(await pluginValue(item)).toBe(text);

        const result = await rollbackFixes(batch.id, null, userId, deps());
        expect(result).toEqual({ rolledBack: 1, failed: [] });
        expect(await pluginValue(item)).toEqual(original);
        expect((await db.fixBatch.findUniqueOrThrow({ where: { id: batch.id } })).state).toBe(
          "rolled_back",
        );
        const html = await (await fetch(url)).text();
        expect(html).not.toContain(text);
      }, 180_000);

      if (mode !== "core") return;

      it("adds alt text through the media library and removes it again", async () => {
        const { batch, fixes } = await preview(crawlId, "ONP-008", [`${ROOT}shop/`]);
        const [fix] = fixes;
        expect(fix?.newValue).toBe("Blue ceramic mug");
        const item: WpItem = { field: "image_alt", ref: fix?.targetRef as WpItem["ref"] };
        const original = await pluginValue(item);
        const published = await publish(batch.id, [fix?.id ?? ""]);
        expect(published.state).toBe("verified");
        await rollbackFixes(batch.id, null, userId, deps());
        expect(await pluginValue(item)).toEqual(original);
      }, 180_000);

      it("replaces a broken link in the page content and restores the content byte for byte", async () => {
        const url = `${ROOT}shop/`;
        const item: WpItem = { field: "post_content", ref: { url } };
        const original = await pluginValue(item);
        const { batch, fixes } = await preview(crawlId, "LNK-002", [url]);
        const [fix] = fixes;
        expect(fix?.currentValue).toBe(`${ROOT}old-mugs/`);
        await editFixValue(fix?.id ?? "", `${ROOT}care-guide/`, userId, deps());
        const published = await publish(batch.id, [fix?.id ?? ""]);
        expect(published.state).toBe("verified");
        expect(String(await pluginValue(item))).toContain('href="/care-guide/"');
        await rollbackFixes(batch.id, null, userId, deps());
        expect(await pluginValue(item)).toBe(original);
      }, 180_000);

      it("removes a noindex page from the sitemap (SMP-008) and puts it back", async () => {
        const url = `${ROOT}old-offers/`;
        const { batch, fixes } = await preview(crawlId, "SMP-008", [url]);
        const [fix] = fixes;
        // High risk: never pre-approved.
        expect(fix).toMatchObject({ recheck: "pass", approved: false, newValue: true });
        const published = await publish(batch.id, [fix?.id ?? ""]);
        expect(published.state).toBe("verified");
        const sitemap = await (await fetch(`${WP_URL}/wp-sitemap-posts-page-1.xml`)).text();
        expect(sitemap).not.toContain(url);
        await rollbackFixes(batch.id, null, userId, deps());
        expect(await pluginValue({ field: "sitemap_exclude", ref: { url } })).toBe(false);
        expect(await (await fetch(`${WP_URL}/wp-sitemap-posts-page-1.xml`)).text()).toContain(url);
      }, 180_000);

      it("removes noindex from an important page (IDX-003) and restores it", async () => {
        const url = `${ROOT}old-offers/`;
        const { batch, fixes } = await preview(crawlId, "IDX-003", [url]);
        const [fix] = fixes;
        const published = await publish(batch.id, [fix?.id ?? ""]);
        expect(published.state).toBe("verified");
        await rollbackFixes(batch.id, null, userId, deps());
        expect(await pluginValue({ field: "noindex", ref: { url } })).toBe(true);
      }, 180_000);

      it("rolls back automatically when verification keeps failing (stale CDN)", async () => {
        const url = `${ROOT}care-guide/`;
        const item: WpItem = { field: "title", ref: { url } };
        const original = await pluginValue(item);
        const { batch, fixes } = await preview(crawlId, "ONP-003", [url]);
        const [fix] = fixes;
        await editFixValue(
          fix?.id ?? "",
          "How to care for ceramic mugs | Example Store",
          userId,
          deps(),
        );
        const snapshot = await loadSnapshot(blobs, orgId, crawlId);
        const stale = new StaleFetcher(snapshot, new Set([url]), new HttpFetcher());
        // One retry allowed: the first failed check schedules it, the second rolls back.
        const scheduled: number[] = [];
        const published = await publish(batch.id, [fix?.id ?? ""], {
          fetcher: () => stale,
          verifyDelays: [1],
          scheduleVerify: async (_id, delay) => void scheduled.push(delay),
        });
        expect(published.state).toBe("rechecking");
        expect(scheduled).toEqual([1]);
        expect(
          await verifyFixBatch(batch.id, deps({ fetcher: () => stale, verifyDelays: [1] })),
        ).toBe("verify_failed");
        const after = await db.fix.findUniqueOrThrow({ where: { id: fix?.id ?? "" } });
        expect(after.state).toBe("verify_failed");
        expect(await pluginValue(item)).toEqual(original);
      }, 180_000);

      it("refuses to roll back a value someone changed after publishing", async () => {
        const url = `${ROOT}shop/`;
        const item: WpItem = { field: "description", ref: { url } };
        const original = await pluginValue(item);
        const { batch, fixes } = await preview(crawlId, "ONP-004", [url]);
        const [fix] = fixes;
        await editFixValue(
          fix?.id ?? "",
          "Our current range of handmade ceramic mugs, glazed and fired in small batches in our studio.",
          userId,
          deps(),
        );
        await publish(batch.id, [fix?.id ?? ""]);
        const postId = wp(["post", "list", "--post_type=page", "--name=shop", "--field=ID"]);
        wp([
          "post",
          "meta",
          "update",
          postId,
          "_seo_platform_description",
          "Edited by the owner in WordPress after the fix went live.",
        ]);
        const result = await rollbackFixes(batch.id, null, userId, deps());
        expect(result.rolledBack).toBe(0);
        expect(result.failed[0]?.error).toMatch(/changed on the site/);
        expect(await pluginValue(item)).toBe(
          "Edited by the owner in WordPress after the fix went live.",
        );
        // Clean up for the next run.
        if (original === null) wp(["post", "meta", "delete", postId, "_seo_platform_description"]);
      }, 180_000);
    });
  }
});
