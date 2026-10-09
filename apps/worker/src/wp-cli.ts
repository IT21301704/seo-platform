// Local development only: runs WP-CLI against the Docker WordPress test site
// (docker compose --profile tools run wpcli). Used by `pnpm wp:setup` and the WordPress tests.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export const WP_URL = "http://localhost:8088";

function repoRoot(from: string = process.cwd()): string {
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(join(dir, "docker-compose.yml"))) return dir;
    if (dirname(dir) === dir) throw new Error("docker-compose.yml not found");
  }
}

/** Runs `wp <args>` in the wpcli container and returns trimmed stdout. */
export function wp(args: string[], input?: string): string {
  return execFileSync(
    "docker",
    ["compose", "--profile", "tools", "run", "--rm", "-T", "wpcli", "wp", ...args],
    {
      cwd: repoRoot(),
      encoding: "utf8",
      input,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 180_000,
    },
  ).trim();
}

/** Like wp() but returns null instead of throwing (e.g. "is-installed" exits 1). */
export function wpTry(args: string[]): string | null {
  try {
    return wp(args);
  } catch {
    return null;
  }
}

/** Saves the connection the plugin would store after the owner pastes the key. */
export function setPluginConnection(
  connection: { app: string; key: string; secret: string } | null,
): void {
  if (connection === null) {
    wpTry(["option", "delete", "seo_platform_connection"]);
    return;
  }
  wp([
    "option",
    "update",
    "seo_platform_connection",
    JSON.stringify(connection),
    "--format=json",
    "--autoload=no",
  ]);
}

/** Activates exactly one SEO plugin ("core" = none). Yoast / Rank Math must be installed. */
export function useSeoPlugin(seo: "core" | "yoast" | "rankmath"): void {
  const plugins = { yoast: "wordpress-seo", rankmath: "seo-by-rank-math" } as const;
  for (const [name, slug] of Object.entries(plugins)) {
    if (name === seo) {
      wp(["plugin", "activate", slug]);
      // Rank Math outputs nothing until its setup wizard is done; this is its "Skip" step.
      if (seo === "rankmath") wp(["option", "update", "rank_math_registration_skip", "1"]);
    } else wpTry(["plugin", "deactivate", slug]);
  }
  // Switching plugins changes rewrite rules (sitemap URLs); rebuild them before anyone crawls.
  wp(["rewrite", "flush"]);
}

export function installedSeoPlugins(): ("yoast" | "rankmath")[] {
  const list = wpTry(["plugin", "list", "--field=name"]) ?? "";
  const names = new Set(list.split(/\s+/));
  return [
    ...(names.has("wordpress-seo") ? (["yoast"] as const) : []),
    ...(names.has("seo-by-rank-math") ? (["rankmath"] as const) : []),
  ];
}
