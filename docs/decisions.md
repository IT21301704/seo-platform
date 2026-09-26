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

## Phase 1 — MVP audit (25–26 Sep 2026)

### Infrastructure
28. **SeaweedFS replaces MinIO for local S3.** MinIO images can no longer be pulled from Docker Hub or quay.io. SeaweedFS (Apache-2.0) speaks the same S3 API; the app creates the bucket on first use, so the init container is gone. Production can use any S3-compatible store. (Supersedes the MinIO part of #26.)
29. **Host ports are configurable: Postgres `POSTGRES_PORT` (default 5433) and WordPress `WORDPRESS_PORT` (default 8088).** 5432 and 8080 were already taken by other software on the dev machine.
30. **Prisma 7 does not read `.env`.** `prisma.config.ts`, the worker and `next.config.ts` load the single repo-root `.env` with Node's `process.loadEnvFile`.
31. **`next.config.ts` sets `agentRules: false`.** Otherwise `next dev` writes `AGENTS.md`/`CLAUDE.md` into `apps/web`; our rules live in the root `CLAUDE.md`.

### Crawler (M2)
32. **Deterministic crawl order:** breadth-first from `/`, each level sorted by URL. Sitemap URLs the links did not reach are crawled next, in sorted order. Canonical targets count as discovered URLs. The page limit cuts the same list every time.
33. **Every redirect hop goes through the fetcher, so the SSRF guard runs again for each hop.** The guard runs inside the DNS lookup at connect time, so the IP we check is the IP we connect to (no DNS-rebinding gap).
34. **Probes:** a fixed not-found URL (`/seo-platform-404-probe-7f3c9a/`) for TEC-009; the http:// and www/apex variants for TEC-007/008; `/llms.txt`. Guessed sitemap paths only count when the body is sitemap XML, because soft-404 sites answer 200 with HTML (found by the broken-technical fixture).
35. **Rendering:** a page is rendered when it runs scripts and its raw body has fewer than 250 words, with at most 50 pages per audit. The browser's requests all go through our fetcher (SSRF guard; fixtures render offline). `Date` and `Math.random` are frozen to the crawl time. **Uploaded code is never rendered** (M3: never execute uploaded code).
36. **Rules read the rendered HTML when a page was rendered, otherwise the raw HTML.** AI-001 compares the two.
37. **Performance uses PageSpeed Insights (which runs Lighthouse) instead of running Lighthouse ourselves.** It prefers CrUX field data, otherwise takes the median of 5 lab runs. INP has no lab value, so it is N/A without field data. The sample is the home page plus the shallowest pages (`PERF_SAMPLE_PAGES`, default 5); sampling by traffic needs GA4 (Phase 2). Without `PSI_API_KEY` the performance rules are N/A, not failed.
38. **`snapshotSetHash` covers the whole snapshot but only the crawl *date*, not the time.** An unchanged site re-audited the same day reuses the stored report (`crawls.reusedFromCrawlId`). The stored report's hash is re-checked before it is reused.

### Rules (M5): 75 rules, ruleset 1.0.0
39. **75 rules in 8 batches:**
    - TEC-001–009
    - IDX-001–007
    - ONP-001–014
    - LNK-001–007
    - SD-001–009
    - AI-001–007
    - PRF-001–009
    - SMP-001/002/004–012/015/016

    SMP-003/013/014 need Search Console (Phase 2). A11Y and OFF are not in Phase 1.
40. **Per-rule pass and fail fixtures are small sites defined in each rule's test file.** The mini-site builder in `@seo/rules/testing` crawls them with the real crawler. The golden and broken sites add integration coverage.
41. **TEC-003 covers only 5xx and connection errors.** 4xx responses are reported by LNK-002 (linked URLs) and SMP-007 (sitemap URLs), so one broken URL is not counted three times.
42. **"Important pages"** (IDX-003, TEC-002, AI-005) are the home page, header navigation pages, and pages linked from the `<main>` content of those pages. Footer-only pages such as a privacy policy are not important (consistent with #22).
43. **ONP-007 thin content fails below 50 words of main content.** The golden site's shortest real pages (collection 57 words, blog index 71) are legitimately short, so the rule flags near-empty pages rather than prescribing a length.
44. **AI-007 `llms.txt` is optional:** N/A when absent; when present it must be well-formed.
45. **Core Web Vitals:** the good band passes; needs-improvement and poor fail.
46. **Sitemap rules score inside Technical (SMP-001/002/004/005/006) or Indexing (the rest)** and also make up the separate Sitemap score.

### Scoring (M6)
47. **Rule weight = severity weight (10/5/2/1), and a rule's pass ratio = passing checks ÷ applicable checks.** N/A rules are out of the denominator. A category with no applicable rule is dropped and the remaining category weights are re-normalised, so an audit without performance data is not penalised. Category scores are rounded for display; the Health score is computed from the unrounded values and rounded once.
48. **Priority = Impact × Confidence × Pages factor ÷ Effort, rounded to one decimal.**
    - Impact comes from severity (Critical 5, High 4, Medium 3, Low 2).
    - Confidence and Effort are set per rule.
    - Pages factor = 1 + failing pages ÷ 20, capped at 2.0; site-wide issues count as 2.0.

    This reproduces the wireframe example (ONP-004, 24 pages → 8.0).
49. **Dashboard tiles count failing checks (rule × page) by severity; the "Medium" tile includes Low.** "Passed" counts passing checks, as in the wireframe.
50. **Broken fixtures score 96–99, not dramatically low.** Each planted fault affects few of the 14 pages, and scores use the share of pages passing. The expected scores are recorded in `fixtures/expected/*.json`.
51. **CI regression gate:** `fixtures/expected/reports/*.report.json` hold byte-exact reports. `pnpm fixtures:update` refuses to overwrite a changed report unless `RULESET_VERSION` was bumped, and the fixture tests fail with that instruction. (Verified by changing a threshold without a bump: both refused.)

### LLM (M7)
52. **Current Claude models reject `temperature` (HTTP 400).** `temperature: 0` is sent only to older models that accept it. For current models, reproducibility comes from the output cache (`ruleId + contentHash + promptVersion + modelId`), which CLAUDE.md rule 4 already requires. The default model is `claude-opus-5` (`LLM_MODEL_ID` overrides it), with `effort: "low"` for short explanations.
53. **Structured outputs:** `messages.parse` with a Zod schema, retried once. After that the explanation falls back to a template built from the rule's own text, which is also used when no API key is set or the per-audit budget (`LLM_MAX_CALLS_PER_AUDIT`, default 30) is used up. Server-side refusal fallbacks to another model are not enabled: a refusal gets the template instead, so the model recorded on the crawl stays true. The schema has no numeric fields, and no LLM output feeds scoring.
54. **Issues store the cache key of their explanation (`issues.explanationKey`)**, so the detail page shows exactly what the audit produced.

### Worker, issues (M19) and web
55. **Issue items:**
    - New items open as Open/New.
    - A passing re-check sets Verified/Resolved; nobody sets Verified by hand.
    - Verified items that fail again become Reopened/Regressed.
    - "Fixed" items that still fail go back to Open.
    - Ignored needs a reason and stays ignored.
56. **Tenant scoping:** a Prisma client extension (`forOrganization`) adds `organizationId` to every query on tenant tables, including unique lookups, so another tenant's ID finds nothing. Unscoped access is limited to the auth adapter, the seed and the shared rule catalog. Auth.js tables (accounts, sessions, verification tokens) belong to a user, not a tenant, and have no `organizationId`.
57. **Auth:**
    - Auth.js v5 (beta, the version that supports Next 16) with a small custom adapter on our Prisma 7 client; a first sign-in creates the user's organization with them as Owner.
    - JWT sessions.
    - Email magic links are printed to the server log when `EMAIL_SERVER` is not set; Google appears when its keys are set.
    - `AUTH_DEV_LOGIN=true` (development and e2e only, ignored in production) signs in as an existing user without email.
    - In development without `AUTH_SECRET`, the secret is derived from the local `DATABASE_URL` so every route bundle agrees on it; production requires a real secret.
58. **`FIXTURE_SITES=true` (development only) serves example-store.com from `fixtures/` instead of the network.** `pnpm db:seed` runs six real pipeline audits of the broken fixtures (3–24 Sep 2026), so the dashboard has a trend and the issue manager has New/Resolved items.
59. **Code upload (M3) accepts ZIP only in Phase 1; public Git URLs come later.** Files are parsed as text and never executed. A malware scanner is not wired up yet. The ZIP is deleted from storage as soon as the audit has read it. A site URL is required, because canonical URLs refer to it.
60. **Screen 07 is a read-only preview for ONP-004 (`/fixes/preview-onp-004`).** Claude drafts descriptions, the rule engine re-checks each draft (`recheckDescription`), and Approve/Publish stay disabled until Phase 3.
61. **Screens of later phases appear in the sidebar with a "Soon" tag and a placeholder page.** GA4 visits show "—" until Phase 2.
62. **Audits can be cancelled; the worker stops at the next stage boundary.**
63. **Live progress (screen 02) uses Server-Sent Events.** The route polls the crawl row and a short Redis log once a second.
64. **Dates render in UTC with fixed English month names**, so server and browser output match ("24 Sep 2026").
65. **Report export:** PDF is rendered by headless Chromium from server-built HTML (network blocked); Excel uses ExcelJS; issue lists export as CSV.
66. **The audit log records every user write action** (project create/update, audit start/cancel, issue bulk changes, draft generation).
