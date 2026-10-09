// pnpm wp:setup [--seo-plugins] — local development only.
// Installs WordPress in Docker with the companion plugin and sample content that has known SEO
// faults, connects it to a "WordPress test site" project for the dev owner and runs an audit.
// Safe to re-run. Needs: docker compose up -d, pnpm db:seed, DEV_ALLOW_PRIVATE_HOSTS=localhost:8088.
import { randomBytes } from "node:crypto";
import { PlaywrightRenderer } from "@seo/crawler/playwright";
import { createPrismaClient, forOrganization } from "@seo/db";
import type { Prisma } from "@seo/db";
import { GuardedJsonHttp, decodeConnectionKey } from "@seo/integrations";
import { createCrawl } from "./crawls";
import { loadRootEnv, requireEnv } from "./env";
import { runPipeline } from "./pipeline";
import { S3BlobStore } from "./storage";
import { checkWordPressConnection, createWordPressConnection } from "./wordpress";
import { WP_URL, setPluginConnection, wp, wpTry } from "./wp-cli";

loadRootEnv();
if (process.env["NODE_ENV"] === "production")
  throw new Error("wp:setup is for local development only");
if (!(process.env["DEV_ALLOW_PRIVATE_HOSTS"] ?? "").includes("localhost:8088")) {
  throw new Error(
    "Set DEV_ALLOW_PRIVATE_HOSTS=localhost:8088 in .env (dev only) so the worker may reach the Docker site.",
  );
}

const ORG_NAME = "Example Store Ceramics";
const PROJECT_NAME = "WordPress test site";
const ROOT = `${WP_URL}/`;
const APP_FROM_DOCKER = process.env["WP_APP_URL"] ?? "http://host.docker.internal:3000";
const withSeoPlugins = process.argv.includes("--seo-plugins");

console.log("WordPress: install and configure");
if (wpTry(["core", "is-installed"]) === null) {
  const password = process.env["WP_ADMIN_PASSWORD"] ?? randomBytes(9).toString("base64url");
  wp([
    "core",
    "install",
    `--url=${WP_URL}`,
    "--title=Example Store (WordPress test site)",
    "--admin_user=admin",
    `--admin_password=${password}`,
    "--admin_email=owner@example-store.com",
    "--skip-email",
  ]);
  console.log(`  installed · admin login: admin / ${password} (local only, shown once)`);
}
wp(["rewrite", "structure", "/%postname%/"]);
wp(["plugin", "activate", "seo-platform"]);
wp(["config", "set", "SEO_PLATFORM_APP_URL", APP_FROM_DOCKER, "--type=constant"]);
if (withSeoPlugins) {
  for (const slug of ["wordpress-seo", "seo-by-rank-math"]) {
    if (wpTry(["plugin", "is-installed", slug]) === null) wp(["plugin", "install", slug]);
  }
  console.log("  Yoast SEO and Rank Math installed (inactive; the tests switch between them)");
}

const page = (title: string, slug: string, content: string, type = "page"): string =>
  wp([
    "post",
    "create",
    `--post_type=${type}`,
    `--post_title=${title}`,
    `--post_name=${slug}`,
    `--post_content=${content}`,
    "--post_status=publish",
    "--porcelain",
  ]);

if (wpTry(["option", "get", "seo_platform_dev_content"]) === null) {
  console.log(
    "WordPress: sample content (known faults: no meta descriptions, an image without alt, a broken link, a noindex page in the sitemap)",
  );
  wpTry(["post", "delete", "1", "2", "3", "--force"]);
  const media = wp(["media", "import", "/dev-content/blue-ceramic-mug.png", "--porcelain"]);
  const img = wp(["eval", `echo wp_get_attachment_url(${media});`]);
  const filler =
    "Every mug is thrown on the wheel, trimmed, glazed and fired by hand in small batches in our island studio. " +
    "Our glazes are food safe and every mug is dishwasher safe. We ship across the country in two to four working days.";
  const home = page(
    "Handmade ceramic mugs",
    "home",
    `<p>${filler}</p><p><a href="/about-us/">About us</a> · <a href="/shop/">Shop</a> · <a href="/care-guide/">Care guide</a></p>`,
  );
  page("About us", "about-us", `<p>We are a small team of potters. ${filler}</p>`);
  page(
    "Shop",
    "shop",
    `<p>Our current mugs. ${filler}</p><p><img src="${img}" width="64" height="48"></p><p>Looking for <a href="/old-mugs/">our old range</a>?</p>`,
  );
  const offers = page("Old offers", "old-offers", `<p>Offers that ended. ${filler}</p>`);
  wp(["post", "meta", "update", offers, "_seo_platform_noindex", "1"]);
  page(
    "How to care for ceramic mugs",
    "care-guide",
    `<p>Wash by hand or in the dishwasher. ${filler}</p>`,
    "post",
  );
  wp(["option", "update", "show_on_front", "page"]);
  wp(["option", "update", "page_on_front", home]);
  wp(["option", "update", "seo_platform_dev_content", "1"]);
}
wp(["rewrite", "flush"]);

console.log("SEO Platform: project, connection and first audit");
const prisma = createPrismaClient(requireEnv("DATABASE_URL"));
const org = await prisma.organization.findFirst({ where: { name: ORG_NAME } });
const owner = org
  ? await prisma.user.findFirst({ where: { organizationId: org.id, role: "owner" } })
  : null;
if (!org || !owner) throw new Error("Run pnpm db:seed first (creates the dev owner).");
const db = forOrganization(prisma, org.id);
const project =
  (await db.project.findFirst({ where: { rootUrl: ROOT } })) ??
  (await db.project.create({
    data: {
      name: PROJECT_NAME,
      rootUrl: ROOT,
      country: "LK",
      language: "en",
      crawlFrequency: "manual",
      timezone: "Asia/Colombo",
      pageLimit: 200,
      cmsType: "wordpress",
      verificationToken: `seo-verify=${randomBytes(12).toString("hex")}`,
      detection: { cms: "wordpress" },
    } as unknown as Prisma.ProjectUncheckedCreateInput,
  }));

const { key } = await createWordPressConnection(db, {
  projectId: project.id,
  organizationId: org.id,
  userId: owner.id,
  appUrl: process.env["APP_URL"] ?? "http://localhost:3000",
});
const decoded = decodeConnectionKey(key);
if (!decoded) throw new Error("connection key did not decode");
setPluginConnection({ app: decoded.app, key: decoded.key, secret: decoded.secret });
const http = new GuardedJsonHttp();
const check = await checkWordPressConnection(db, project.id, http, () => new Date());
console.log(
  check.ok
    ? `  connected · ${check.status.seoPlugin} · plugin ${check.status.pluginVersion}`
    : `  connection failed: ${check.error}`,
);

const crawl = await createCrawl(db, { projectId: project.id, inputType: "url" });
const report = await runPipeline(crawl.id, {
  prisma,
  db,
  blobs: S3BlobStore.fromEnv(),
  llm: null,
  progress: null,
  makeRenderer: (fetcher) => new PlaywrightRenderer(fetcher),
  now: () => new Date(),
});
console.log(`  audit ${crawl.id}: health ${report.score.health}`);
console.log(`\nOpen http://localhost:3000/projects/${project.id} (sign in as ${owner.email}).`);
await http.close();
await prisma.$disconnect();
