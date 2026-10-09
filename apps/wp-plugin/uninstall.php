<?php
/**
 * Removes the plugin's settings. Values written into Yoast SEO / Rank Math / the media library
 * stay (they belong to the site); the plugin's own standalone meta and redirects are removed.
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

foreach ( array( 'seo_platform_connection', 'seo_platform_redirects', 'seo_platform_robots_lines', 'seo_platform_sitemap_exclude', 'seo_platform_home', 'seo_platform_log' ) as $option ) {
	delete_option( $option );
}
foreach ( array( '_seo_platform_title', '_seo_platform_description', '_seo_platform_canonical', '_seo_platform_noindex' ) as $key ) {
	delete_post_meta_by_key( $key );
}
