# Paste this into Claude Code (first session)

Before pasting: extract this zip into an empty project folder and open that folder in VS Code. The wireframes are already in `docs/wireframes/` (PNG screenshots + static HTML).

---

You are the lead engineer building a production-quality SaaS product from scratch in this repository.

**Read these first, fully, before writing any code:**
1. `docs/REQUIREMENTS.md`: the complete A–Z requirements, including architecture, 19 modules, scoring model, Sitemap Validation API, issue manager, data model, and a screen-by-screen wireframe spec (Part G).
2. `CLAUDE.md`: the non-negotiable rules for every session.
3. `docs/wireframes/README.md`, then look at every image in `docs/wireframes/png/` and use the matching file in `docs/wireframes/html/` for exact text, colours and structure.

**The product in one line:** a website SEO platform that crawls a site, scores it with a deterministic rule engine (same input = same result every time), uses Claude only to explain and draft fixes, applies approved fixes through CMS integrations, verifies them, and keeps monitoring. It must never promise rankings or indexing.

**Your task now: Phase 0 (Foundation) only.**
1. Write a short implementation plan for Phase 0 and Phase 1 (bullets, files to create, risks). Show it to me before building.
2. After I approve, build Phase 0:
   - pnpm + Turborepo monorepo with the folder structure in REQUIREMENTS Part D
   - `docker-compose.yml` with Postgres, Redis, MinIO and a WordPress test site
   - Prisma schema covering the Phase 0–1 tables in Part H (organizations, users, projects, crawls, pages, page_facts, links, rules, check_results, scores, issues, issue_items, llm_outputs, audit_log), plus a migration
   - `packages/shared` with version constants (crawlerVersion, rulesetVersion, weightsVersion, promptVersion)
   - `fixtures/golden-site`: a small, fully SEO-optimized and AI-discoverable static site for "example-store.com" (a handmade ceramic mug shop), following Part J
   - `fixtures/broken-sites`: at least 5 copies of the golden site, each with known faults, each with an expected result JSON in `fixtures/expected/`
   - Test setup (Vitest) and a GitHub Actions CI workflow running lint, type-check and tests
   - `docs/decisions.md` with the decisions you made
3. Run everything, make sure all tests pass, then STOP. Give me a short summary, the commands to run it locally, and your plan for Phase 1.

**Rules while working:**
- Follow `CLAUDE.md` strictly: the LLM never scores, results are deterministic, versions are stored, no fix without approval, SSRF protection, no secrets in code.
- Build only the current phase. Do not start the next phase until I say "continue".
- If something is unclear, pick the simplest option that fits the requirements, write it in `docs/decisions.md`, and continue. Ask me only if the decision is expensive to undo.

---

## Prompts for the next phases (use one at a time)

**Phase 1:** "Continue with Phase 1 (MVP audit) from REQUIREMENTS Part K: modules M1–M8 and basic M19, screens 01–05 plus a read-only 07. Add rules in batches of 10 with fixtures and tests. The golden site must score exactly 100 and the determinism test must pass 10/10. Stop and summarise when done."

**Phase 2:** "Continue with Phase 2: M9 (Search Console, GA4, CrUX with dated snapshots), M10, M11, M17 Sitemap Validation API (detection, manual-add and remove lists, REST endpoints and webhook, no auto-fix yet) and the full M19 issue manager. Screens 10, 13, 14. Respect the URL Inspection quota of 2,000 per site per day. Stop and summarise."

**Phase 3:** "Continue with Phase 3: M12 auto-fix, M13 WordPress companion plugin (signed webhooks, Yoast/Rank Math support), M14 verify and rollback, M17 sitemap auto-fixes and M18 keyword research using Search Console data. Screens 07, 08, 09, 15. Prove apply → verify → rollback on the Docker WordPress site. Stop and summarise."

**Phase 4:** "Continue with Phase 4: M15 Copilot, M16 Authority panel, Stripe billing (screen 12), Shopify app, Webflow and GitHub pull-request integrations, and an optional paid keyword API. Stop and summarise."
