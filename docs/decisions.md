# Decisions log

Decisions made where the spec was unclear or left a choice open. Newest phase at the bottom.
Format: **Decision** — why. (Revisit: when to reconsider.)

## Phase 0 — Foundation (25 Sep 2026)

### Tooling
1. **pnpm 10 + Turborepo 2, Node ≥ 22.12 (CI uses Node 22 from `.nvmrc`).** Node 22 is the current LTS; local Node 24 also works. Dependency versions are pinned once in the pnpm `catalog:` (`pnpm-workspace.yaml`) so every package uses the same version.
2. **TypeScript 6.0, not 7.0.** typescript-eslint 8 supports TypeScript < 6.1 only. (Revisit: when typescript-eslint supports TS 7.)
3. **Packages export TypeScript source directly (`"exports": "./src/index.ts"`), with `moduleResolution: "Bundler"`.** No build step is needed for tests, type-checks or Next.js. The worker gets a bundler/tsx runner in Phase 1.
4. **ESLint runs once from the root; type-check and tests run per package through Turbo.** A single lint pass is faster and simpler than 13 per-package ESLint runs.
5. **Prettier ignores the user-authored `CLAUDE.md`, `00-START-PROMPT.md` and `docs/`**, plus the fixture sites, so nothing reformats them.

### Folder structure
6. **Phase-0 skeletons for every package and app in Part D** (package.json, tsconfig, empty `src/index.ts`, README with its phase). No Next.js scaffold yet: screens are Phase 1 work.
7. **Rule category folders live at `packages/rules/<category>/`**, as written in Part D and CLAUDE.md (not under `src/`).

### Database
8. **Prisma 7.10 (latest stable), with the new `prisma-client` generator and `prisma.config.ts`.** The npm `latest` tag points at an 8.0 release candidate, so it is skipped. The client uses the `@prisma/adapter-pg` driver adapter.
9. **Table names are snake_case via `@@map` to match Part H; column names stay camelCase** (Prisma default).
10. **Every table has `organizationId`, and every index starts with it.** Exception: `rules.organizationId` is nullable, because built-in rules are shared by all tenants (a future custom rule would set it).
11. **The first migration is generated with `prisma migrate diff --from-empty`, which needs no database.** Tests apply it to **PGlite** (in-process Postgres), so the migration is verified without Docker. The CI `database` job applies migrations to a real Postgres 16 and fails on schema drift.
12. **Priority is stored as `Decimal(6,2)` on `issues`.** It is computed by the scoring package, never by the LLM.
13. **Enum values are lowercase (`critical`, `in_progress`).** They match the TypeScript union types in `@seo/shared`.

### Fixtures
14. **The golden site is "Example Store Ceramics", a pottery studio in Galle Fort, Sri Lanka**, on `example-store.com`. It has 14 pages with clean trailing-slash URLs plus a 404 page, `robots.txt`, `sitemap.xml` and `llms.txt`. Prices are in LKR, because Sri Lanka is the first market. The address and phone number are fictional.
15. **Fixture images are small SVGs, and the `og:image` is a generated 1200×630 PNG.** No binary photo assets are needed, and file names are descriptive.
16. **"Lazy loading" means: the first image in `<main>` loads eagerly (`fetchpriority="high"`, a likely LCP image) and every other image in `<main>` has `loading="lazy"`.** Header logo images are ignored. This is the definition the Phase 1 performance rule will use.
17. **`_fixture.json` holds what a static folder cannot express:**
    - `crawledAt`: a fixed "now" that rules use instead of `Date.now()`
    - HTTP→HTTPS and www→apex redirects (`alternateOrigins`)
    - redirects, status overrides and the 404 status (`notFoundStatus`)
    - response headers and recorded compression
    - **recorded Core Web Vitals bands**, because Lighthouse is non-deterministic and needs a browser
    - `ownerIntent.aiCrawlers`, the intent AI-002 compares `robots.txt` against

    The schema is `FixtureServerSchema` in `@seo/shared`.
18. **Broken sites are full copies of the golden site.** Each expected JSON lists `changedFiles`, and a test fails if a broken site differs from golden in any other file. This stops the copies from drifting when the golden site changes.
19. **Seven broken sites, one theme each:** on-page, indexing, links, schema, AI, sitemap, technical.
20. **Expected JSON lists the planted faults *and* their obvious cascades.** For example, a noindex page that stays in the sitemap also fails SMP-008. Every other applicable rule must pass. The rule IDs follow the wireframes where they appear there: ONP-004 is the meta description, IDX-003 is noindex on an important page, LNK-002 is broken internal links, SD-004 is a Product without offers. **These IDs are a contract for Phase 1.** If a Phase 1 rule reveals another cascade, the expected JSON is updated in the same change and noted here.
21. **`expectedScore` is `100` for the golden site (fixed by the spec) and `null` for broken sites until the scoring engine exists (Phase 1).**
22. **"Important pages" for IDX-003 are the home page, the main-nav pages, collections and products.** Policy pages are not important, so noindex on the privacy page fails only SMP-008 (in broken-sitemap).
23. **When JSON-LD cannot be parsed (SD-001), the other schema rules are N/A on that page, not failed.** This avoids double-counting one fault.
24. **The fixtures are generated with LF endings and hashed byte-for-byte.** `.gitattributes` forces LF (this overrides a global `core.autocrlf=true`), and a test fails on any CR byte or BOM.
25. **Phase 0's determinism test hashes each fixture 10 times.** Phase 1 extends it to "run the engine 10× → byte-identical result JSON".

### Infrastructure
26. **Docker Compose runs Postgres 16, Redis 7, MinIO (plus a one-shot job that creates the `snapshots` bucket), and WordPress 6 + MariaDB 11 on :8080.** `apps/wp-plugin` is mounted read-only into WordPress. All credentials are local-only defaults, overridable via `.env`.
27. **Docker was not installed on the dev machine during Phase 0.** CI checks the compose file with `docker compose config`, and database tests use PGlite, so every local test runs without Docker.
