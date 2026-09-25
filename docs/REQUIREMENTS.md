# AI SEO Remediation Platform — Full Requirements (A to Z)

Version 1.0 · 25 Sep 2026 · Owner: [Product owner name]
Working product name: **[Product name]** (placeholder — use `SEO Platform` in code until decided)

This document is the single source of truth for building the product. It combines the approved product blueprint and the approved wireframes (15 screens). Build exactly what is described here. When something is unclear, choose the simplest option that matches this document, write the decision in `docs/decisions.md`, and continue.

---

## Part A — The story

### A1. The problem
Small businesses, e-commerce stores and agencies want their websites to rank on Google and be understood by AI assistants (Google AI Overviews / Gemini, ChatGPT, Claude, Perplexity). Existing SEO tools show hundreds of issues but:
- give different results on different runs,
- don't say which issue to fix first,
- don't fix anything themselves,
- don't prove that a fix worked,
- can't undo a bad change.

### A2. The product
A SaaS platform where a user adds a website (URL or code upload). The platform:

**Detect → Explain → Prioritize → Fix → Verify → Monitor**

1. **Detect** — crawls the site and runs deterministic, rule-based checks (technical, indexing, on-page, performance, links, structured data, AI discoverability, XML sitemap).
2. **Explain** — Claude (LLM) explains each failed check in plain language with exact fix steps.
3. **Prioritize** — issues are ranked by Impact × Confidence × Pages factor ÷ Effort.
4. **Fix** — supported issues are fixed automatically through CMS integrations, only after the user previews and approves.
5. **Verify** — the changed URLs are re-crawled and the same rule is re-run: Before ❌ → After ✅.
6. **Monitor** — scheduled crawls and alerts catch new problems; every change can be rolled back.

### A3. What we promise and what we never promise
- ✅ The **SEO Health Score** (0–100) measures compliance with SEO best practices. It is 100% reproducible: **same input + same versions = same score, same issues, same text.**
- ✅ Every check result is traceable to a rule ID and version.
- ❌ We never promise a #1 ranking, a place in AI Overviews, or guaranteed indexing. Google decides rankings and indexing. Show this in the UI (footer of Dashboard and Sitemap screens) and in the Terms.

### A4. Users (personas)
| Persona | Needs |
|---|---|
| Small business owner (non-technical) | A clear score, "what to fix first", one-click safe fixes |
| Marketer / SEO specialist | All issues, filters, keyword research, history, reports |
| Developer | Per-page issues, exact code snippets, API access, GitHub PR fixes |
| Agency | Many client sites, team roles, white-label reports |

### A5. Roles
Owner, Admin, Editor (can approve fixes), Viewer (read only). Only Owner/Admin/Editor can approve or roll back fixes.

---

## Part B — Golden rules (non-negotiable)

1. **The LLM never decides pass/fail, severity, priority or score.** Only the rule engine does. The LLM only explains and drafts content.
2. **Determinism:**
   - Every report stores: `crawlerVersion`, `rulesetVersion`, `weightsVersion`, `promptVersion`, `llmModelId`, `snapshotSetHash`.
   - Every crawled page is stored as an HTML snapshot with a SHA-256 content hash.
   - If the snapshot hashes and all versions match a previous report → return the cached report.
   - Crawl order is fixed: sorted URL queue, fixed page limit, fixed user agent, viewport, timeouts, render wait.
   - LLM output is cached by key = `ruleId + pageContentHash + promptVersion + llmModelId`. Temperature 0. Output must match a Zod JSON schema.
   - Lab performance = median of 5 Lighthouse runs, scored in bands (Good / Needs improvement / Poor), not raw ms. Prefer CrUX field data when available.
   - External data (Search Console, GA4, keyword volumes, backlinks) is saved as dated snapshots; reports reference the snapshot date.
   - Final score is rounded to a whole number.
3. **No fix without approval.** Detect → Recommend → Preview → Approve → Apply → Verify → (Rollback). Always store the old value before applying.
4. **No manipulative SEO.** No keyword stuffing, no automated link building, no link buying, no cloaking.
5. **Security first:** SSRF protection on every fetch, encrypted tokens, domain verification before auto-fix or showing GSC data.
6. **Fix the generator, not the output.** For sitemaps and meta tags, change the CMS/plugin/framework setting that generates them, otherwise the next rebuild overwrites the fix.

---

## Part C — Architecture

```
Website (URL / code upload / CMS plugin webhook)
   │
   ▼
Onboarding → Crawler (HTTP + Playwright) → Snapshot store (HTML + hash)
   │
   ▼
Rule engine (deterministic)  ◄── Google data: Search Console, GA4, PageSpeed/CrUX
   │
   ▼
Scoring + Priority  →  LLM layer (Claude: explain, draft, cached)
   │
   ▼
Dashboard + Issue manager + Copilot
   │
   ▼
Auto-fix (preview → approve) → Integration layer (WordPress plugin first)
   │
   ▼
Verify (re-crawl changed URLs) → Change log + Rollback → Monitoring + Alerts → (back to Crawler)
```

### C1. Where data comes from
| Data | Source | Cost | Freshness |
|---|---|---|---|
| Page HTML, status codes, links, meta, schema, sitemap | Our own crawler | Free | On demand / scheduled / webhook |
| Scores, issues | Our rule engine | Free | Each audit |
| Indexing, queries, clicks, sitemaps status | Google Search Console API (OAuth) | Free | Usually 2–3 days delay |
| Per-URL index state | Search Console URL Inspection API | Free, **2,000 per site per day, 600 per minute** | Daily batches |
| Page traffic | GA4 Data API (OAuth) | Free | Daily (Realtime report optional) |
| Core Web Vitals | Lighthouse (self-run) + PageSpeed Insights / CrUX API (API key) | Free | Lab: now; field: 28-day rolling |
| Explanations, drafts, clustering, Copilot | Claude API | Paid | On demand, cached |
| Search volume, difficulty | Keyword provider API (e.g. DataForSEO) | Paid — **Phase 3+, optional** | Monthly |
| Backlinks | Backlink provider API | Paid — **Phase 4+, optional** | Weekly |

The Claude API does NOT replace Google APIs or the crawler. It has no access to Google's private data and must never invent numbers.

### C2. How data stays fresh ("near real-time")
1. **Event-based:** the WordPress plugin sends a signed webhook (`page.updated`, `page.deleted`) → re-crawl only that URL → re-run checks → update dashboard.
2. **Scheduled:** full crawl per plan (weekly / daily); GSC and GA4 pulls daily at 02:00 site time.
3. **On demand:** "Run audit" button, or the API.
4. Dashboard updates live via Server-Sent Events (or WebSocket) when a job finishes.
5. Every screen shows "Data as of <date>".

---

## Part D — Tech stack and repository

| Part | Choice |
|---|---|
| Language | TypeScript everywhere (except the WordPress plugin: PHP) |
| Monorepo | pnpm workspaces + Turborepo |
| Web app + API | Next.js (App Router), route handlers for REST API |
| UI | Tailwind CSS + shadcn/ui, Recharts for charts, font IBM Plex Sans / IBM Plex Mono |
| Workers | Node + BullMQ |
| Queue / cache | Redis |
| Database | PostgreSQL + Prisma |
| Crawler | undici (HTTP) + Playwright (JS rendering) + Cheerio (parsing) |
| Performance | Lighthouse (Node) + PageSpeed Insights / CrUX API |
| LLM | Anthropic SDK (Claude), Zod output schemas |
| Auth | Auth.js (email + Google). Google OAuth also used for GSC/GA4 scopes |
| Billing | Stripe (Phase 4) |
| Storage | S3-compatible object storage (MinIO locally) |
| Tests | Vitest (unit), Playwright (e2e) |
| Local dev | Docker Compose: Postgres, Redis, MinIO, WordPress test site |
| Monitoring | Sentry + structured logs |

```
seo-platform/
  CLAUDE.md
  docs/  REQUIREMENTS.md  decisions.md  wireframes/
  apps/
    web/          # Next.js dashboard + REST API
    worker/       # crawl, render, lighthouse, rules, llm, fix, verify, gsc-sync jobs
    wp-plugin/    # WordPress companion plugin (PHP)
  packages/
    shared/       # types, constants, versions
    db/           # Prisma schema + migrations
    crawler/      # fetch, render, robots, sitemap discovery, snapshot, hash, SSRF guard
    rules/        # one file per rule + registry
      technical/ indexing/ onpage/ performance/ links/ schema/ ai/ sitemap/ offpage/
    scoring/      # weights, formula, priority
    llm/          # prompts (versioned), Zod schemas, cache
    integrations/ # gsc, ga4, psi-crux, wordpress, (shopify, webflow, github, cloudflare later)
    fixes/        # fix generators, apply, verify, rollback
    keywords/     # keyword research (Phase 3)
  fixtures/
    golden-site/   # reference site that must score 100
    broken-sites/  # copies with known faults
    expected/      # expected JSON result per fixture
  docker-compose.yml
```

---

## Part E — Modules (19)

| # | Module | Phase |
|---|---|---|
| M1 | Onboarding & project setup | 1 |
| M2 | Crawler | 1 |
| M3 | Code-upload analyzer | 1 |
| M4 | Performance layer | 1 |
| M5 | Rule engine | 1 |
| M6 | Scoring & prioritization | 1 |
| M7 | LLM analysis | 1 |
| M8 | Dashboard & reports | 1 |
| M19 | Issue manager | 1 (basic) → 2 (full) |
| M9 | Google integrations (GSC, GA4, CrUX) | 2 |
| M10 | Monitoring & alerts | 2 |
| M11 | Change history | 2 |
| M17 | Sitemap Validation API | 2 |
| M12 | Auto-fix engine | 3 |
| M13 | CMS integration layer (WordPress first) | 3 |
| M14 | Verification, audit log & rollback | 3 |
| M18 | Keyword research | 3 |
| M15 | AI SEO Copilot | 4 |
| M16 | Off-page Authority + competitor/SERP | 4–5 |

### M1 — Onboarding
- Input: live URL, or code upload (ZIP up to [100] MB, or public Git repo URL).
- Detect: sitemap.xml (robots.txt `Sitemap:` lines, `/sitemap.xml`, `/sitemap_index.xml`, `/wp-sitemap.xml`), robots.txt, HTTPS validity, CMS (WordPress / Shopify / Webflow / other) from HTML, headers and generator tags.
- Domain verification: DNS TXT (recommended), HTML meta tag, or verification file. Required before auto-fix and before GSC data is shown.
- Optional connections: Search Console, GA4, WordPress plugin.
- Settings: target country, language, search engine (Google), crawl frequency, page limit (from plan).
- Acceptance: a user can add a site and start the first audit in under 2 minutes; detection results shown as chips.

### M2 — Crawler
- Collect per page: HTTP status, redirect chain, canonical, meta title/description, meta robots + X-Robots-Tag, H1–H6, internal/external links (+ anchor text), images (+ alt, size, format), page size, hreflang, Open Graph/Twitter tags, JSON-LD, pagination links, lang attribute, viewport.
- Detect orphan pages (in sitemap but not linked), duplicates (content hash), depth.
- Render JS pages with Playwright when raw HTML is missing main content; record both raw and rendered HTML (needed for AI-discoverability check AI-001).
- Politeness: respect robots.txt for our user agent `SEOPlatformBot/1.0 (+https://[domain]/bot)`, 2 requests/second per domain, timeouts, max page size [5] MB.
- **SSRF guard:** block private/loopback/link-local/metadata IPs; re-check after every redirect and DNS resolution.
- Deterministic order: BFS from the root + sitemap URLs, URLs normalised and sorted, stop at plan limit.

### M3 — Code-upload analyzer
- Parse uploaded HTML files statically. Checks that need a server (status codes, redirects, real speed, GSC) are marked **Not applicable**, never failed, and excluded from the denominator.
- Never execute uploaded code. Scan for malware. Delete after retention period.

### M4 — Performance
- Lighthouse mobile, median of 5 runs, on a fixed sample of pages (home + top [20] by traffic or depth).
- CrUX field data for LCP, INP, CLS where available (preferred).
- Score in bands only.

### M5 — Rule engine
- Each rule: `id` (e.g. `ONP-004`), `version`, `category`, `severity` (Critical 10 / High 5 / Medium 2 / Low 1), `appliesTo` (url / code / both), `autoFixable`, `riskLevel` (low / medium / high), `evaluate(pageFacts, siteFacts) → pass | fail | na + evidence`.
- Rules are pure functions (no network, no randomness, no dates except from snapshot).
- Start with ~80 rules (see Part F).

### M6 — Scoring & prioritization
Category score = Σ(wᵢ × passedᵢ) ÷ Σ(wᵢ × applicableᵢ) × 100 (page-level rules use the share of pages passing).
Health score = Σ(category weight × category score), rounded.

| Category | Weight (v1) |
|---|---|
| Technical & crawlability | 20% |
| Indexing | 15% |
| On-page | 20% |
| Performance | 15% |
| Internal links | 10% |
| Structured data | 10% |
| AI discoverability | 10% |

Off-page (Authority) is a separate panel, **not** in the health score. Sitemap checks count inside Technical & Indexing and also produce a separate Sitemap score.

Priority = Impact (1–5) × Confidence (0–1) × Pages factor ÷ Effort (1–5).

### M7 — LLM analysis (Claude)
- Input: failed rule results + relevant page excerpt (title, headings, first 2,000 words). Never whole sites.
- Output JSON: `whyItMatters`, `seoImpact`, `fixSteps[]`, `developerInstructions` (code snippet), `contentSuggestion`, `sideEffects`.
- Validate with Zod; retry once; fall back to a template explanation.
- Generated content (titles, descriptions, alt text, schema) is re-checked by the rule engine before it can be approved.
- Batch similar issues (one prompt for 24 missing descriptions). Cache everything. Cap LLM calls per plan.
- Also used for: keyword clustering and intent, schema drafts, content-gap outlines, Copilot answers.

### M8 — Dashboard & reports
See screen 03. PDF and Excel export of the latest report.

### M9 — Google integrations
- Search Console: Search Analytics (queries, clicks, impressions, CTR, position), Sitemaps (list, submit, errors/warnings), URL Inspection (index state). OAuth, read-only scope except sitemap submit.
- GA4 Data API: sessions per page, last 28 days.
- PageSpeed Insights / CrUX API with an API key.
- Respect quotas; queue and retry with backoff; store snapshots with `fetchedAt`.

### M10 — Monitoring & alerts
- Scheduled crawls by plan; diff against previous snapshot.
- Alert rules: score drop > N points, new Critical issue, pages became noindex, weekly summary.
- Channels: email (Phase 2), Slack (Phase 2), WhatsApp (later).

### M11 — Change history
- Score trend, issue counts per rule over time (e.g. broken links 34 → 12 → 0).

### M12 — Auto-fix engine
- Low-risk (bulk allowed after preview): meta descriptions, alt text, duplicate titles, internal broken link replacement.
- High-risk (approve each): robots.txt, redirects, canonicals, noindex, sitemap changes, schema.
- Flow: generate → rule re-check → preview (old vs new) → approve (per item or batch) → apply → verify → log.

### M13 — Integrations for applying fixes
| Site type | Method | What can be changed |
|---|---|---|
| WordPress (Phase 3, first) | Our companion plugin; API key; signed requests | Title/description (Yoast / Rank Math / core), alt text, noindex, canonical, redirects, sitemap settings (include/exclude post types), robots.txt (virtual), lastmod; sends webhooks on content change |
| Shopify (Phase 4) | Shopify app, Admin API | SEO fields, hide from search (SEO hidden), URL redirects, robots.txt.liquid via theme. Sitemap itself is auto-generated and not directly editable |
| Webflow (Phase 4) | Webflow Data API | Page/CMS SEO fields (check API support for sitemap options before building) |
| Custom / framework (Phase 4) | GitHub/GitLab App | Opens a pull request with the fix |
| Cloudflare (Phase 5) | API token + Worker | Serve corrected sitemap.xml / robots.txt / redirects at the edge |
| No access | — | Download corrected files + manual lists |

### M14 — Verification, audit log, rollback
- After apply: re-crawl changed URLs, re-run the same rule. CDN delay: retry at 5 min, 30 min, 24 h before marking failed. Failed → automatic rollback.
- Audit log: who, what, when, page, field, old value, new value, source (AI / user), fix batch ID, verification result.
- Rollback per item or per batch.

### M15 — AI SEO Copilot
- Chat over crawl + GSC + GA4 + history. Answers must cite check IDs and data sources.
- Copilot can start a fix preview but can never publish.
- Suggested prompts: "Why is my SEO score low?", "Show the 5 most important problems", "Fix all low-risk issues", "Why is <URL> not indexed?"

### M16 — Authority (off-page) + competitors
- Referring domains, backlinks, toxic links, Google Business Profile completeness, NAP consistency, sameAs profiles.
- Advice only, never auto-fixed. Competitor/SERP analysis is Premium (Phase 5).

### M17 — Sitemap Validation API
**Detection flow:** discover sitemaps (robots.txt, common paths, GSC list) → detect generator (Yoast / Rank Math / WP core / Shopify / Webflow / Next.js / static) → validate files → fetch and check every listed URL → compare with crawl (missing / extra) → Search Console Sitemaps + URL Inspection → issues + Sitemap score.

| ID | Check | Severity | Auto-fix |
|---|---|---|---|
| SMP-001 | Sitemap exists, HTTP 200 | Critical | Generate via CMS |
| SMP-002 | Listed in robots.txt | High | Add `Sitemap:` line |
| SMP-003 | Submitted in Search Console | High | Submit via API |
| SMP-004 | Valid XML (sitemaps.org schema), UTF-8, valid gzip | Critical | Regenerate |
| SMP-005 | ≤ 50,000 URLs and ≤ 50 MB uncompressed per file | Critical | Split + sitemap index |
| SMP-006 | Absolute URLs, same host, https | High | Regenerate |
| SMP-007 | Every URL returns 200 (no 3xx/4xx/5xx) | High | Remove / replace with final URL |
| SMP-008 | No noindex URLs | High | Remove |
| SMP-009 | No robots-blocked URLs | High | Remove |
| SMP-010 | Only canonical URLs | Medium | Replace with canonical |
| SMP-011 | lastmod valid W3C date, not in future | Medium | Use CMS modified date |
| SMP-012 | Indexable pages missing from sitemap | High | Add via CMS, else manual list |
| SMP-013 | GSC reports sitemap errors/warnings | High | Depends |
| SMP-014 | Listed URLs not indexed (URL Inspection state) | Medium | Review only |
| SMP-015 | hreflang alternates valid (multi-language) | Medium | Regenerate |
| SMP-016 | Image / video sitemap entries valid | Low | Regenerate |

- `priority` and `changefreq` are ignored by Google → never scored.
- URL Inspection quota 2,000/site/day: inspect in daily batches, highest-traffic first; show "inspected X of Y"; never extrapolate.
- There is no Google API to force indexing of normal pages; the tool resubmits the sitemap but must not claim guaranteed indexing.
- **Manual URL list** — a URL is included only if ALL are true: returns 200, self-canonical, no noindex, not robots-blocked, not in any sitemap, and cannot be added automatically (no integration, static file, page outside CMS, excluded post type). Row: URL, reason, found via (crawl / internal links / GSC), suggested lastmod, target sitemap file. Export CSV / JSON / ready-to-paste `<url>` XML. Users can tick "added".
- **Remove list** — URLs that must be removed (separate list, never mixed).
- **REST API** (API key or OAuth; JSON):

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/v1/projects/{projectId}/sitemap-checks` | Start check (async) → `checkId` |
| GET | `/v1/sitemap-checks/{checkId}` | Status, score, counts, versions |
| GET | `/v1/sitemap-checks/{checkId}/issues` | Filter by severity/rule/status; paged |
| GET | `/v1/sitemap-checks/{checkId}/urls` | Every sitemap URL with status, indexability, GSC state |
| GET | `/v1/sitemap-checks/{checkId}/manual-urls?format=csv\|json\|xml` | Manual add list |
| GET | `/v1/sitemap-checks/{checkId}/remove-urls` | Remove list |
| POST | `/v1/sitemap-checks/{checkId}/fixes` | Create fix batch (preview) |
| POST | `/v1/fix-batches/{batchId}/approve` | Apply approved fixes |
| POST | `/v1/fix-batches/{batchId}/rollback` | Undo |
| Webhook | `sitemap.check.completed` | Notify caller |

Example summary response:
```json
{
  "checkId": "smc_1042", "status": "completed", "score": 76,
  "versions": { "ruleset": "1.1.0", "crawler": "1.0.0" },
  "sitemaps": 3, "urlsInSitemaps": 1184,
  "issues": { "critical": 0, "high": 4, "medium": 2, "low": 0 },
  "autoFixable": 5, "manualUrls": 23, "urlsToRemove": 41,
  "gsc": { "inspected": 1184, "indexed": 1006, "notIndexed": 178, "fetchedAt": "2026-09-25T02:00:00Z" }
}
```

### M18 — Keyword research
- Sources: GSC queries (free, Phase 3 start), keyword provider API (paid, optional), crawl.
- Features: keyword ideas (seed + country + language) with volume, difficulty, intent; clusters (Claude); keyword-to-page map (one primary + secondaries per page, user-editable); quick wins (positions 5–20, high impressions); cannibalization (≥2 pages with impressions for the same query → issue `KWD-002`); content gaps (cluster with no page → Claude page outline); position tracking from GSC.
- On-page checks read the map: primary keyword appears naturally in title, H1, description. No density targets.
- Never let Claude invent search volumes. If no provider is connected, show `—` and "Connect keyword data".
- Keyword sets saved as dated snapshots.

### M19 — Issue manager
- Two levels: **issue type** (rule) and **issue item** (rule × page). Stable key = `ruleId + normalisedUrl`, tracked across audits.
- Views: Grouped (default), Flat list, By page, Board (by status), By source (Site audit / Sitemap API / Keywords / Monitoring).
- Filters: severity, category, source, status, fix type, assignee, URL/folder, first seen, new since last audit. Saved views.
- Bulk actions on selection: auto-fix (→ preview), assign, set status, due date, ignore with reason, export (CSV/Excel; Jira later).
- Status workflow: Open → In progress → Fixed → Verified; Fixed → Open if re-check fails; Verified → Reopened if it comes back; Open → Ignored (reason required) → Open.
- Each audit tags items: New / Still open / Resolved / Regressed. Progress bar "63 of 100 resolved".
- Comments, @mentions, owner, due date, notifications on assign/regression.
- Server-side paging, sorting, filtering; must stay fast at 50,000 items.

---

## Part F — Check catalog (v1, ~80 rules; build in batches of 10)

| Category | Rule examples |
|---|---|
| Technical (TEC) | robots.txt valid; key pages not blocked; 4xx/5xx; redirect chain > 1 hop; redirect loops; HTTPS + valid SSL; HTTP→HTTPS; www consistency; custom 404 returns 404 |
| Indexing (IDX) | noindex on important pages; canonical missing/wrong/non-200; duplicate content; orphan pages; pagination; hreflang errors |
| On-page (ONP) | title missing/duplicate/length; meta description missing/duplicate/length 70–160; exactly one H1; heading order; thin content; image alt; descriptive filenames; clean URLs; OG + Twitter tags; lang; viewport |
| Performance (PRF) | LCP / INP / CLS bands; page weight; image size/format; lazy loading; render-blocking resources; compression; caching headers |
| Links (LNK) | broken internal/external links; depth > 3 clicks; pages without inbound links; anchor text; breadcrumbs |
| Structured data (SD) | valid JSON-LD; required fields for Organization, LocalBusiness, Product/Service, FAQ, BreadcrumbList, Article; schema matches visible content |
| AI discoverability (AI) | key content in raw HTML without JS (AI-001); AI crawler rules in robots.txt as owner intends (Googlebot, Google-Extended, GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot); clear About/Services/Pricing/Contact/FAQ/Policies pages; consistent name/address/phone; FAQ in Q&A format; no nosnippet on key pages; optional llms.txt |
| Sitemap (SMP) | SMP-001 … SMP-016 (see M17) |
| Accessibility (A11Y, bonus) | contrast, form labels, link text, landmarks |
| Off-page (OFF, Authority panel only) | referring domains, toxic links, GBP completeness, NAP consistency, sameAs |

Every rule needs: a passing HTML fixture, a failing HTML fixture and a unit test.

---

## Part G — Screens (from the approved wireframes)

Global layout: 1280+ px desktop; left dark sidebar (240 px) with groups **Analyse** (Dashboard, Issue manager, Sitemap check, AI Copilot), **Fix** (Auto-fix review, Sitemap URL lists, Change log), **Grow** (Keyword research, Monitoring, Authority), **Settings** (Integrations, Plans & billing, Add website). Top bar: site name + page title left, actions right. Must also work on tablet and mobile (sidebar collapses).

Visual style: neutral warm grey background `#F4F4F1`, white cards with 1 px `#E1E1DC` border and 10 px radius, ink `#1A1D21`, muted `#5C6066`, primary blue `#2446C7`. Severity pills: Critical red `#B42318` on `#FDECEA`, High orange `#A64206` on `#FEF0E1`, Medium amber `#7A5E00` on `#FBF4D9`, Passed/Low green `#1F7A3A` on `#E6F4EA`. Fonts IBM Plex Sans (UI) and IBM Plex Mono (URLs, IDs, numbers). Accessible: real buttons/links/labels, 4.5:1 contrast, keyboard navigable.

Sample data in the wireframes uses `example-store.com`; use it for seed data and fixtures.

| # | Screen | Route | Key content |
|---|---|---|---|
| 01 | Add website (M1, M3) | `/onboarding` | Left: 4-step stepper (Website, Verify ownership, Connect data, Audit settings) + "what happens next". Right: 4 cards — URL / Upload code tabs + detection chips; verification method radios + TXT value + "Check now"; connect GSC / GA4 / WordPress plugin; settings selects. Buttons: Cancel, Start first audit |
| 02 | Audit running (M2, M4, M5) | `/projects/[id]/audits/[auditId]` | Progress bar "Step 2 of 6", 6 stages (Discover, Crawl, Render, Performance, Run checks, Explain) with Done/Running/Waiting; Run fingerprint card (input, snapshot hash, crawler/ruleset/weights versions, model/prompt); live log; politeness note |
| 03 | Dashboard (M6, M8) | `/projects/[id]` | Health score donut (82/100, change since last audit, versions line "same input = same score"); severity tiles Critical/High/Medium/Passed (link to issues); score by category bars with weights; link to Authority; Top 5 priorities table; score trend (6 audits); "Since last audit" list |
| 04 | Issue manager (M19) | `/projects/[id]/issues` | "63 of 100 resolved" progress + New/Still open/Regressed/Resolved chips; view tabs; saved view; search + filters; bulk action bar; grouped rows (checkbox, expand, title + rule ID, source, severity, open/total, assignee, fix type) expanding to page items (URL, New/Regressed tag, status, owner, since) |
| 05 | Issue detail (M7) | `/projects/[id]/issues/[ruleId]` | What we found + rule definition; affected pages with GA4 visits; Why it matters (AI explanation, cached, model/prompt version); How to fix + code snippet; priority breakdown; auto-fix card with step pills + "Generate & preview fix"; verification before/after; side effects |
| 06 | AI Copilot (M15) | `/projects/[id]/copilot` | Suggested prompts; chat with cited check IDs and data-source chips; action buttons (Open issue, Preview fix); input; right panel: data used, how Copilot works, usage meter |
| 07 | Auto-fix review (M12) | `/projects/[id]/fixes/[batchId]` | Step bar Detect → Recommend → Preview → Approve → Publish → Verify; pass/need-edit counts; table: approve checkbox, page, current value, AI suggestion, chars, re-check result (Pass / Too short / Duplicate + Edit); "Approve N & publish"; rollback note; target integration shown |
| 08 | Change log (M14) | `/projects/[id]/changes` | Batches with source, approver, time, verification state (Verified N/N, Re-checking CDN, Verify failed → auto rolled back, Rolled back); expandable old/new table with per-item Undo; Roll back batch |
| 09 | Integrations (M9, M13) | `/projects/[id]/integrations` | Card grid: Google (Search Console, GA4, PageSpeed/CrUX), Website platforms (WordPress connected, Shopify/Webflow/GitHub coming soon), Data & alerts (Backlink data, Slack, WhatsApp, Cloudflare); security note |
| 10 | Monitoring (M10, M11) | `/projects/[id]/monitoring` | Weekly score line chart with annotated drop; changes detected feed (newest first); broken-links history bars; alert channels; alert rules |
| 11 | Authority (M16) | `/projects/[id]/authority` | "Not part of Health Score"; 5 tiles; top referring domains table (toxic flagged); advice-only actions; no-link-buying note; Premium competitor card |
| 12 | Plans & billing | `/settings/billing` | Usage meters; Free / Starter / Pro / Agency cards with limits; prices `[PRICE]` |
| 13 | Sitemap check (M17) | `/projects/[id]/sitemap` | Tiles: sitemap score, URLs in sitemaps, indexed in Google, add manually, remove; 16 SMP checks with Pass / Fail·auto-fix / Not applicable; Google index status breakdown (URL Inspection) with "inspected X of Y · limit 2,000/day"; sitemap files table; buttons View API response, Run check, Fix N automatically; note that indexing is not guaranteed |
| 14 | Sitemap URL lists (M17) | `/projects/[id]/sitemap/urls` | Tabs "Add manually (23)" / "Remove from sitemap (41)"; rule explanation; table (added checkbox, URL, why not auto-added, found via, lastmod, target file); XML preview; API endpoints; Re-check sitemap |
| 15 | Keyword research (M18) | `/projects/[id]/keywords` | Seed + country + language search; tabs Ideas / Clusters / Keyword map / Quick wins / Cannibalization / Content gaps; ideas table (keyword, intent, volume, difficulty, your position, mapped page); quick wins, cannibalization and content-gap cards; snapshot note |

Plans (placeholders to validate): Free (1 project, 100 pages, manual crawls, score + top 10 issues) · Starter (3 projects, 1,000 pages, weekly, low-risk auto-fix, GSC, history, PDF) · Pro (10 projects, 10,000 pages, daily, all auto-fixes + rollback, Copilot, alerts, Authority) · Agency (50+ projects, 50,000 pages, white-label, team roles).

---

## Part H — Data model (Prisma, minimum)

organizations, users (role), projects (rootUrl, verifiedAt, cmsType, country, language, crawlFrequency), integrations (type, encryptedToken, scopes, status), crawls (inputType, status, versions, snapshotSetHash), pages (url, statusCode, contentHash, depth, isIndexable, snapshotPath), page_facts, links, rules, check_results (result pass/fail/na, evidence JSON), scores, issues (rule-level per project), issue_items (stableKey, ruleId, url, status, assigneeId, dueDate, firstSeen, lastSeen, regressedAt), issue_comments, llm_outputs (cacheKey …), fixes (field, oldValue, newValue, risk, state, approvedBy, appliedAt, verifiedAt, batchId), fix_batches, audit_log, alerts, reports, sitemap_checks, sitemap_files, sitemap_urls (listType: manual_add / remove / ok), gsc_snapshots, ga4_snapshots, keywords, keyword_snapshots, keyword_page_map, plans, subscriptions, usage_counters, api_keys, webhooks.

All tables scoped by `organizationId` (multi-tenant). Use row-level checks in every query.

---

## Part I — Security & compliance
- SSRF guard in the crawler (see M2). Sandbox Playwright in its own container.
- Encrypt OAuth tokens, CMS keys and API keys at rest; least-privilege scopes; never send tokens to the browser.
- Signed webhooks (HMAC) between WordPress plugin and API; replay protection.
- Rate limiting on public API; API keys per project with scopes.
- Audit log for every write action.
- Data retention: snapshots 90 days; reports while subscribed.
- Terms (no ranking guarantee), Privacy Policy, DPA; follow Google API policies; Sri Lanka PDPA and GDPR.

---

## Part J — Testing & accuracy proof
1. **Golden site** (`fixtures/golden-site`): a small, fully SEO-optimized, AI-discoverable static site (semantic HTML, correct heading hierarchy, unique titles/descriptions, canonical, OG, JSON-LD Organization/LocalBusiness/Service/FAQ/Breadcrumb, sitemap.xml, robots.txt, optimised lazy-loaded images, accessible nav, real 404, clear About/Services/Pricing/Contact/FAQ/Policies content in raw HTML). **Must score 100.**
2. **Broken sites**: copies of the golden site, each with known faults, each with an expected JSON result.
3. One unit test per rule (pass + fail fixture).
4. **Determinism test**: run each fixture 10× → byte-identical result JSON.
5. CI regression gate: any change to fixture results fails CI unless `rulesetVersion` is bumped.
6. WordPress in Docker: apply → verify → rollback returns exactly the original value.
7. Benchmark 20 real sites against Search Console, Rich Results Test and PageSpeed Insights; log mismatches.

---

## Part K — Delivery phases (build in this order, stop for review after each)

| Phase | Deliver | Done when |
|---|---|---|
| 0 Foundation | Monorepo, Docker Compose, Prisma schema, CLAUDE.md, golden + broken fixtures with expected JSON, CI | `pnpm test` runs; fixtures exist |
| 1 MVP audit | M1–M8 + basic M19; screens 01–05 + 07 read-only preview; auth | Golden site = 100; determinism test 10/10; all fixtures match |
| 2 Google + monitoring | M9, M10, M11, M17 (detection, lists, API, no auto-fix yet), full M19; screens 10, 13, 14 | GSC/GA4 connected with snapshots; sitemap API returns example response shape; alerts by email/Slack |
| 3 Auto-fix | M12, M13 (WordPress plugin), M14, M17 auto-fix, M18 (GSC-based); screens 07, 08, 09, 15 | Apply → verify → rollback passes on Docker WordPress |
| 4 Expand | M15 Copilot, M16 Authority, Stripe billing (screen 12), Shopify, Webflow, GitHub PRs, paid keyword API | Paying beta users |
| 5 Premium | Competitor/SERP analysis, white-label, Cloudflare | Agency plan launched |

---

## Part L — Open decisions (use the default until told otherwise)
| Question | Default |
|---|---|
| Product name / domain | `SEO Platform` placeholder |
| First customers | Small businesses + agencies, English, global; Sri Lanka as first market |
| First CMS | WordPress |
| Keyword data provider | None until Phase 3; GSC queries only |
| Backlink provider | None until Phase 4 |
| Prices | `[PRICE]` placeholders |
| Final category weights | v1 table above; validate with benchmark |
