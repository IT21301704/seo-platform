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
61. **Screens of later phases appear in the sidebar with a "Soon" tag and a placeholder page.** GA4 visits show "—" until Phase 2 (done: decision 67).
62. **Audits can be cancelled; the worker stops at the next stage boundary.**
63. **Live progress (screen 02) uses Server-Sent Events.** The route polls the crawl row and a short Redis log once a second.
64. **Dates render in UTC with fixed English month names**, so server and browser output match ("24 Sep 2026").
65. **Report export:** PDF is rendered by headless Chromium from server-built HTML (network blocked); Excel uses ExcelJS; issue lists export as CSV.
66. **The audit log records every user write action** (project create/update, audit start/cancel, issue bulk changes, draft generation).

## Phase 2 — Google data, monitoring, sitemap API, issue manager (26 Sep 2026)

### Google data (M9)
67. **Search Console, GA4 and CrUX data are stored as dated snapshots** (`gsc_snapshots`, `ga4_snapshots`, `crux_snapshots`, `url_inspections`). An audit copies the latest GSC snapshot into the crawl snapshot (`external.gsc`) *before* hashing, and records `crawls.gscSnapshotId`. Re-running an audit therefore gives the same result for the same data, and `snapshotSetHash` changes when the Google data changes.
68. **URL Inspection quota: at most 2,000 per site per day and 600 per minute.** The day is Google's quota day (Pacific time). A `usage_counters` row per organization, site and day is incremented atomically before each call, so parallel syncs cannot exceed the limit. A 429 from Google stops the run. Order: never-inspected URLs first, then results older than 7 days; within each group, most-visited pages (GA4) first. The screen shows "Inspected X of Y · limit 2,000 per day (N used today)".
69. **Ranges:** Search Console uses the 28 days ending 3 days ago (data delay); GA4 uses the last 28 complete days.
70. **OAuth is read-only** (`webmasters.readonly`, `analytics.readonly`). Tokens are encrypted with AES-256-GCM (`ENCRYPTION_KEY`) and refreshed server-side; they never reach the browser. The OAuth state is an encrypted, short-lived cookie compared in constant time. All Google calls go through the SSRF-guarded HTTP client.
71. **Demo provider:** when no Google OAuth client is configured and `FIXTURE_SITES=true` (development only), "Connect" creates a deterministic demo connection labelled "Demo data" everywhere. The seed uses it. It is refused in production.
72. **Where Google is connected:** in Phase 2, before the Integrations screen (09) existed, the Connect / Sync now / Disconnect controls sit on the Sitemap check and Monitoring screens. Onboarding step 3 points there ("After setup"), because the project does not exist yet while the form is filled in.
73. **Ruleset 1.1.0 adds three GSC rules: SMP-003 (sitemap submitted in Search Console), SMP-013 (Search Console reports sitemap errors) and SMP-014 (listed in sitemap but not indexed).** They are N/A without GSC data, so fixture scores are unchanged (golden = 100); reports were re-recorded for the version bump.

### Monitoring and alerts (M10, M11)
74. **Monitoring compares each completed audit with the previous one** (score drop, new critical issues, pages that became noindex, new broken links, fixed issues) and stores `monitoring_events`. The rule engine output is the only input; nothing is estimated.
75. **Default alert rules when a project has none:** score drop ≥ 5 points, new critical issue and noindex are on; the weekly summary is off.
76. **Channels:** email (SMTP via `EMAIL_SERVER`; logged when unset) and Slack incoming webhooks. Slack URLs must be `https://hooks.slack.com/…` and are encrypted at rest.
77. **Schedule in the project's time zone** (set from the country at onboarding, editable on the Monitoring screen): daily at 02:00, weekly on Monday at 02:00, Google sync daily after 02:00, weekly summary Monday 08:00. A BullMQ repeatable job ticks every 5 minutes; scheduled audits create issues with source "Monitoring".
78. **Issue history (M11)** counts failing check results per audit for one rule (last 6 audits), from stored `check_results`, on the Monitoring screen and the issue detail page.

### Sitemap Validation API (M17)
79. **A sitemap check reuses the crawler and the SMP rules** on its own record (`smc_…` id), without a full audit. Its issues have source "Sitemap API" and it only resolves SMP issues, so it never closes audit issues.
80. **Lists:** "Add manually" only contains URLs that return 200, are self-canonical, indexable, not blocked by robots.txt, missing from every sitemap *and* cannot be added automatically (generator unknown or not writable). "Remove" lists sitemap URLs that are not 200, noindex, canonicalised elsewhere or blocked, with the reason. Downloads: CSV, JSON and an XML urlset.
81. **REST API under `/v1`:** Bearer API keys (`seo_live_…`, shown once, stored as SHA-256), scopes `sitemap:read` / `sitemap:write`, 60 requests per minute per key (Redis). A signed-in session also works for the same endpoints (used by the download buttons); viewers are read-only. The fix endpoints (`/fixes`, `/fix-batches/…`) returned 501 until Phase 3 (see 102).
82. **Webhooks:** https only, SSRF-checked when saved and when sent. Events `sitemap.check.completed` and `audit.completed`. Header `x-seo-signature: t=<unix>,v1=<hex>` = HMAC-SHA256 of `<t>.<body>`; receivers should reject timestamps older than 5 minutes. 5 retries with exponential backoff; every attempt is logged.

### Issue manager (M19)
83. **Five views:** Grouped, Flat list, By page, Board (by status) and By source. Filters: search, severity, source, status, assignee, category, fix type, first seen since, new since last audit, sort. All filtering, counting and paging run in Postgres; grouped view loads 5 items per issue type. Tested with 50,000 items (every query under 2 s; in practice far below).
84. **Saved views are per user** and store the filter query string. There is one view per filter set: saving the same filters under a new name renames the view.
85. **Bulk actions:** status, ignore (reason required), assign (notifies the assignee in-app and by email), due date. Exports: CSV and Excel with the same filters (max 50,000 rows).
86. **Comments are per issue type**, with `@name` / `@email` mentions that notify teammates. Notifications (mentions, assignments, regressions, alerts) have a page and an unread badge in the sidebar.

## Phase 3 — Auto-fix, WordPress plugin, verify and rollback, sitemap fixes, keywords (Oct 2026)

### Auto-fix engine (M12)
87. **Fix kinds per rule** (`packages/fixes`): meta description (ONP-004), title (ONP-001/002/003), image alt (ONP-008) and broken internal link (LNK-002) are **low risk** (pre-ticked when they pass the re-check, bulk approval). noindex (IDX-003), canonical (IDX-001/002), redirect chain (TEC-004), robots.txt `Sitemap:` line (SMP-002), sitemap removal (SMP-007/008/009/010) and sitemap inclusion (SMP-012) are **high risk** (never pre-ticked; the API requires each fix id). Other auto-fixable rules (schema, AI crawler rules, sitemap regeneration, lastmod, robots edits beyond the Sitemap line) stay "guide only" in Phase 3.
88. **The rule engine re-checks every proposed value by simulation:** the value is applied to the stored audit snapshot (HTML head, image alt, links, redirect chain, robots.txt, sitemap XML) and the same rules are re-run. All drafts of a batch are applied together, so drafts that duplicate each other fail. The LLM never decides acceptance.
89. **Drafts:** descriptions and titles come from Claude (cached; titles use the new `DRAFT_PROMPT_VERSION = draft-v1.0`, kept separate from `PROMPT_VERSION` so reports and cached explanations do not change). Without an API key the owner types the values. Alt text comes from the file name (deterministic; marked "check it matches the picture"); broken-link targets from the most similar crawled page. Nothing invents numbers.
90. **A batch covers one rule** and at most 200 items, numbered per project (`B-0001`). Generation runs in the worker (`fixes` queue). "Regenerate all" replaces an unpublished preview.
91. **Publishing needs a verified domain and a connected target.** Without WordPress the batch is preview-only, with a CSV of the values that pass (REQUIREMENTS M13 "No access → download corrected files").

### WordPress companion plugin (M13)
92. **Connection:** the app creates a connection key `seowp_<base64url {app, key id, secret}>`, shown once; the secret is stored encrypted on the integration row. The owner pastes it in Settings → SEO Platform. "Check connection" calls the plugin's signed `/status`; a correctly signed answer from the project's host **verifies the domain** (new verification method `plugin`), because only a site admin can install the key.
93. **Signing (both directions):** headers `x-seo-key`, `x-seo-timestamp`, `x-seo-nonce`, `x-seo-signature: v1=<hex>`, HMAC-SHA256 over `timestamp\nnonce\nMETHOD\nroute\nsha256(body)`; ±5 minutes; nonces single-use (WordPress transients / Redis). The REST route is called through `?rest_route=`, so it works without pretty permalinks. A shared test vector checks that PHP and TypeScript sign identically.
94. **Fix the generator:** values are written where the active SEO plugin reads them: Yoast (`_yoast_wpseo_*`), Rank Math (`rank_math_*`), or the plugin's own fields when neither is active (it then outputs title, description, robots and canonical itself). Alt text goes to the media library, plus a `wp_content_img_tag` filter for content images without alt. Redirects, robots.txt lines and sitemap exclusions are plugin options applied through WordPress, Yoast and Rank Math filters. Category and tag archives cannot be changed yet (item skipped and shown as manual).
95. **Every write is conditional:** the plugin writes only if the site still has the value we expect, otherwise `conflict`. Publishing reads the old value and stores it before writing; rollback writes the old value only if the site still shows what we published, then reads it back and compares. Values are normalised (null = not set, booleans, arrays); that normalised value is what "exactly the original value" means.
96. **Content-change webhooks** (`page.updated`, `page.deleted`) re-audit the site at most once per 10 minutes per project (BullMQ job id per time bucket). Changes made by the platform itself are not reported back.
97. **Rank Math outputs nothing until its setup wizard is finished or skipped;** the plugin reports `seoPluginReady` and "Check connection" explains it. Local dev: `pnpm wp:setup` (WP-CLI in Docker) installs WordPress, the plugin, optionally Yoast and Rank Math (`-- --seo-plugins`), sample content with known faults, connects it to a "WordPress test site" project and audits it.
98. **Dev-only SSRF exception:** `DEV_ALLOW_PRIVATE_HOSTS=localhost:8088` lets the worker reach the Docker site (exact host and port). It is ignored when `NODE_ENV=production`.

### Verification, audit log, rollback (M14)
99. **Verify = re-crawl the changed URLs** (and robots.txt or sitemaps for those fixes), patch them into the audit snapshot and re-run the same rules; text fields must also show the published value. A page that does not load never counts as verified. Retries at 5 min, 30 min and 24 h (delayed jobs, "Re-checking · CDN cache, next try …"); after that, fixes that never verified are **rolled back automatically** and the approver is notified.
100. **Issue items follow fixes:** published → Fixed, verified → Verified, rolled back → Open. The next audit tags them as usual.
101. **Audit log:** every create, edit, approve, publish, verification failure and rollback is logged with actor, before and after values and source (AI, user or system). The Change log (screen 08) shows published batches with per-item Undo, Roll back batch and Re-apply.

### Sitemap auto-fix (M17)
102. **`POST /v1/sitemap-checks/{id}/fixes`** creates one batch per failing sitemap rule that has a fix (using the check's own stored snapshot); `GET /v1/fix-batches/{id}` shows its state; `/approve` (high risk: `fixIds` required) and `/rollback` work. SMP-003 "submit via API" stays manual: it needs the write scope `webmasters`, and Phase 2 chose read-only OAuth.

### Keyword research (M18)
103. **Source: Search Console query × page × country**, saved daily as a dated `keyword_snapshots` row (up to 25,000 rows). No paid provider yet: volume and difficulty show "—" with "Connect keyword data"; language filtering also needs a provider (Search Console has no language dimension).
104. **Deterministic analysis** (`packages/keywords`): impression-weighted positions; intent from fixed word lists; ideas = queries sharing a word with the seed; quick wins = position 5–20 and at least 50 impressions; cannibalization (KWD-002) = two or more pages each with at least 10% and 10 impressions of a query; content gap = a cluster with no mapped page ranking in the top 20.
105. **Clusters:** Claude groups the queries (cached, no numbers asked); queries it leaves out, or all of them without an API key, are grouped by their most common word.
106. **Keyword map:** one primary plus up to 5 secondary keywords per page, filled automatically from Search Console clicks. Entries the owner sets are never changed automatically. KWD-001 checks the primary keyword's words in the title, H1 and description (no density targets).
107. **Keyword issues are not part of the Health Score** (they depend on the owner's map and on Search Console data). They appear in the issue manager with source "Keywords".
108. **Page briefs** for content gaps are Claude drafts for review (cached, Zod-validated, no volumes or ranking claims).

### Other
109. **Project switcher** in the sidebar, for owners with several sites (for example after adding the WordPress test site).
110. **Bug fixed:** URL inspections were stamped with the wall clock instead of the sync time, so an audit could miss them when the sync time and the clock differ.
