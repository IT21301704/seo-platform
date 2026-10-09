# @seo/fixes

Auto-fix logic (M12, M14), pure and deterministic:

- `kinds.ts` — which rules have an automatic fix, risk (low = bulk approval, high = approve each), plugin field.
- `candidates.ts` — failing outcomes → fix candidates (per page, image or link); deterministic suggestions in `suggest.ts`.
- `simulate.ts` + `recheck.ts` — apply proposed values to the stored audit snapshot and re-run the same rules (the LLM never decides).
- `verify.ts` — re-fetch the changed URLs (robots.txt, sitemaps), patch the snapshot, re-run the rules, compare the live value.

Orchestration (database, WordPress plugin, queue, retries, rollback) lives in `apps/worker/src/fixes.ts`.
