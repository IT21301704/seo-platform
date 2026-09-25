# CLAUDE.md — rules for every coding session

## What we are building
An AI SEO remediation SaaS: Detect → Explain → Prioritize → Fix → Verify → Monitor.
Full spec: `docs/REQUIREMENTS.md` (single source of truth). Decisions log: `docs/decisions.md`.

## Non-negotiable rules
1. The **rule engine** alone decides pass/fail, severity, priority and score. The LLM (Claude) only explains and drafts. Never let LLM output change a score.
2. **Same input + same versions = same output.** Store crawlerVersion, rulesetVersion, weightsVersion, promptVersion, llmModelId and snapshotSetHash on every report. Rules are pure functions: no network, no randomness, no `Date.now()`.
3. Bump `rulesetVersion` whenever a rule or weight changes. CI fails if fixture results change without a version bump.
4. LLM calls: temperature 0, Zod-validated JSON output, cached by `ruleId + contentHash + promptVersion + modelId`. Never ask the LLM for numbers we must measure (search volume, rankings, speed).
5. No change to a user's website without preview + approval. Save the old value before applying. Every change is logged and can be rolled back.
6. Fix the generator (CMS/plugin/framework setting), not the generated output.
7. Security: SSRF guard on every outbound fetch (block private IPs, re-check after redirects), encrypt tokens at rest, never send secrets to the browser, scope every DB query by organizationId.
8. No manipulative SEO features (keyword stuffing, link buying, cloaking).
9. Never claim guaranteed rankings or indexing in UI copy.

## How to work
- Build one phase at a time (see REQUIREMENTS Part K). At the end of each phase: run all tests, summarise what was built, list open questions, then STOP and wait for review.
- Package build order: shared → db → crawler → rules → scoring → llm → worker → web.
- Add rules in batches of ~10. Each rule = one file in `packages/rules/<category>/`, a pass fixture, a fail fixture and a unit test.
- UI follows the wireframe spec in REQUIREMENTS Part G (colours, fonts, layout, screen contents). Use `example-store.com` for seed data.
- When the spec is unclear: choose the simplest option that fits the spec, record it in `docs/decisions.md`, continue.
- Keep functions small and typed. No `any`. Prefer server components; client components only for interactivity.

## Commands (keep this section up to date)
- `docker compose up -d` — Postgres, Redis, MinIO, WordPress test site (http://localhost:8080)
- `pnpm install` — needs pnpm 10 (`npm i -g pnpm@10` or `corepack enable`)
- `pnpm dev` — web + worker (from Phase 1)
- `pnpm lint` / `pnpm typecheck` / `pnpm format:check`
- `pnpm test` — unit tests (Vitest), including the migration test on in-process Postgres
- `pnpm test:fixtures` — golden/broken site results + determinism check (10 runs)
- `pnpm test:e2e` — Playwright (from Phase 1)
- `pnpm db:generate` — generate the Prisma client
- `pnpm db:migrate` — apply Prisma migrations (needs `DATABASE_URL`)

## Environment variables (never commit values)
DATABASE_URL, REDIS_URL, S3_*, ANTHROPIC_API_KEY, LLM_MODEL_ID, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, PSI_API_KEY, ENCRYPTION_KEY, NEXTAUTH_SECRET, STRIPE_* (Phase 4)
