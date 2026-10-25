import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Loads the repo-root .env once (Node's built-in loader; values already set win). The root is
 * found by walking up from the working directory to pnpm-workspace.yaml. (Not
 * `new URL(..., import.meta.url)`: the web app bundles this module and Turbopack would treat it
 * as an asset, failing the build when .env is absent.)
 */
export function loadRootEnv(from: string = process.cwd()): void {
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      const path = join(dir, ".env");
      if (existsSync(path)) process.loadEnvFile(path);
      return;
    }
    if (dirname(dir) === dir) return;
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return value;
}
