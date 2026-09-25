import { defineConfig } from "prisma/config";

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
