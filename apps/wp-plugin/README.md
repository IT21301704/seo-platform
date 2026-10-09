# SEO Platform Companion (WordPress plugin)

Applies the fixes an owner approves in SEO Platform, keeps the old value so every change can be
rolled back, and tells SEO Platform when content changes (REQUIREMENTS M13). PHP 7.4+, WordPress 6.0+.
Works with **Yoast SEO**, **Rank Math**, or on its own.

## Install

1. In SEO Platform: Integrations → WordPress → _Download the plugin_ (`seo-platform.zip`, built from
   this folder without `dev/` and `tests/`).
2. WordPress: Plugins → Add New → Upload Plugin → Activate.
3. SEO Platform: _Create connection key_; WordPress: Settings → SEO Platform → paste → Connect.
4. SEO Platform: _Check connection_. A correctly signed answer from the site verifies the domain.

## What it changes (only after approval)

| Field                           | Yoast SEO                                                                                             | Rank Math                                             | No SEO plugin                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| Title / description / canonical | `_yoast_wpseo_title` / `_metadesc` / `_canonical`                                                     | `rank_math_title` / `_description` / `_canonical_url` | `_seo_platform_*` meta, printed by this plugin  |
| noindex                         | `_yoast_wpseo_meta-robots-noindex` (1 / 2)                                                            | `rank_math_robots`                                    | `_seo_platform_noindex` (1 / 0) via `wp_robots` |
| Alt text                        | media library `_wp_attachment_image_alt` + `wp_content_img_tag` filter for content images without alt | same                                                  | same                                            |
| Broken link                     | `post_content` (exact bytes restored on rollback)                                                     | same                                                  | same                                            |
| Redirects                       | option `seo_platform_redirects`, served on `template_redirect`                                        | same                                                  | same                                            |
| robots.txt `Sitemap:` line      | option `seo_platform_robots_lines`, `robots_txt` filter (not when a physical robots.txt exists)       | same                                                  | same                                            |
| Sitemap exclusion               | `wpseo_exclude_from_sitemap_by_post_ids`                                                              | `rank_math/sitemap/entry`                             | `wp_sitemaps_posts_query_args`                  |

Home pages that list posts: title and description go to the SEO plugin's home settings. Category
and tag archives are not supported yet (reported as `not_found`, shown as a manual item).

Rank Math prints nothing until its setup wizard is finished or skipped; `/status` reports
`seoPluginReady: false` and the app explains it.

## REST API (signed, no WordPress login)

`GET /status`, `POST /read`, `POST /write` under `seo-platform/v1`, called as
`/?rest_route=/seo-platform/v1/…`. Every request carries `x-seo-key`, `x-seo-timestamp`,
`x-seo-nonce` and `x-seo-signature: v1=<hex>` = HMAC-SHA256 of
`timestamp\nnonce\nMETHOD\nroute\nsha256(body)`. Requests older than 5 minutes and reused nonces
are refused. Writes include `expect` (the value the app believes is current); a different value on
the site returns `conflict` and nothing is written.

## Events

On publish/update and trash/delete of public content the plugin sends a signed `page.updated` /
`page.deleted` to `<app>/v1/wordpress/events` (fire-and-forget). Its own writes are not reported.
`SEO_PLATFORM_APP_URL` in wp-config.php overrides the app URL (local Docker: `host.docker.internal`).

## Development

- `pnpm wp:setup [-- --seo-plugins]` — WordPress + this plugin in Docker with sample content.
- `docker compose exec wordpress php wp-content/plugins/seo-platform/tests/signature-test.php` —
  PHP signatures match the TypeScript test vector.
- `apps/worker/src/wordpress.test.ts` — apply → verify → rollback against the Docker site (alone,
  with Yoast SEO and with Rank Math).
