# Wireframes (approved)

15 desktop screens (1280 x 900). Sample data uses example-store.com.
- `png/`  - screenshots. Look at these for layout and visual style.
- `html/` - the same screens as static HTML (open in a browser; links between screens work).
  Copy exact text, colours, spacing and structure from these files.

Full screen-by-screen spec (routes, content, behaviour): `docs/REQUIREMENTS.md` Part G.

| # | Screen | Module | Route |
|---|---|---|---|
| 01 | Add website | M1, M3 | /onboarding |
| 02 | Audit running | M2, M4, M5 | /projects/[id]/audits/[auditId] |
| 03 | Dashboard | M6, M8 | /projects/[id] |
| 04 | Issue manager | M19 | /projects/[id]/issues |
| 05 | Issue detail | M7 | /projects/[id]/issues/[ruleId] |
| 06 | AI Copilot | M15 | /projects/[id]/copilot |
| 07 | Auto-fix review | M12 | /projects/[id]/fixes/[batchId] |
| 08 | Change log | M14 | /projects/[id]/changes |
| 09 | Integrations | M9, M13 | /projects/[id]/integrations |
| 10 | Monitoring | M10, M11 | /projects/[id]/monitoring |
| 11 | Authority (off-page) | M16 | /projects/[id]/authority |
| 12 | Plans & billing | SaaS | /settings/billing |
| 13 | Sitemap check | M17 | /projects/[id]/sitemap |
| 14 | Sitemap URL lists | M17 | /projects/[id]/sitemap/urls |
| 15 | Keyword research | M18 | /projects/[id]/keywords |

Rules: the wireframes show layout and content, not final pixels. Build them with Tailwind + shadcn/ui
components, keep the colours and fonts from REQUIREMENTS Part G, and make them responsive.
Numbers shown are sample data - real values come from the rule engine and APIs.
