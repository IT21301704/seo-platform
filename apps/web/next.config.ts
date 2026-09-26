import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// One .env at the repo root for every app.
const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  // Our rules live in the repo-root CLAUDE.md; do not generate app-level agent files.
  agentRules: false,
  transpilePackages: [
    "@seo/shared",
    "@seo/db",
    "@seo/crawler",
    "@seo/rules",
    "@seo/scoring",
    "@seo/llm",
    "@seo/worker",
  ],
  serverExternalPackages: [
    "playwright",
    "@prisma/client",
    "@prisma/adapter-pg",
    "exceljs",
    "bullmq",
    "ioredis",
    "undici",
  ],
  experimental: {
    // Code uploads (ZIP) go through a Server Action: 100 MB + multipart overhead.
    serverActions: { bodySizeLimit: "101mb" },
  },
  poweredByHeader: false,
};

export default config;
