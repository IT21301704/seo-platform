import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Loads the repo-root .env once (Node's built-in loader; values already set win). */
export function loadRootEnv(): void {
  const path = fileURLToPath(new URL("../../../.env", import.meta.url));
  if (existsSync(path)) process.loadEnvFile(path);
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name} (see .env.example)`);
  return value;
}
