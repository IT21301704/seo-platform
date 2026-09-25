import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer reads .env files; load the repo-root .env when it exists.
const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Only needed by commands that talk to a database (migrate deploy).
    // `prisma generate` and `migrate diff --from-empty` work without it.
    url: process.env.DATABASE_URL ?? "",
  },
});
