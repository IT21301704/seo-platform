# @seo/db

Prisma schema and migrations (PostgreSQL). Every table is scoped by `organizationId`.

- `pnpm db:generate` — generate the Prisma client into `src/generated/` (git-ignored).
- `pnpm db:migrate` — apply migrations (`DATABASE_URL` required).
- `pnpm db:migration:sql` — print the SQL for the full schema. After changing `schema.prisma`,
  add a new folder under `prisma/migrations/` (with Postgres running: `pnpm exec prisma migrate dev --name <name>`).

Tests apply the migration to PGlite (in-process Postgres), so they need no Docker.
