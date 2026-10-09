<?php
/**
 * Plugin Name:       SEO Platform Companion
 * Description:       Applies SEO fixes you approve in SEO Platform (titles, descriptions, alt text, noindex, canonicals, redirects, sitemap and robots.txt settings), keeps the old values so every change can be rolled back, and tells SEO Platform when content changes. Works with Yoast SEO, Rank Math or on its own.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            SEO Platform
 * License:           GPL-2.0-or-later
 * Text Domain:       seo-platform
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'SEO_PLATFORM_VERSION', '1.0.0' );
/** REST contract version; must match PLUGIN_API_VERSION in packages/integrations. */
define( 'SEO_PLATFORM_API_VERSION', 1 );
define( 'SEO_PLATFORM_DIR', __DIR__ );

require_once __DIR__ . '/includes/class-signature.php';
require_once __DIR__ . '/includes/class-connection.php';
require_once __DIR__ . '/includes/class-seo-plugins.php';
require_once __DIR__ . '/includes/class-fields.php';
require_once __DIR__ . '/includes/class-output.php';
require_once __DIR__ . '/includes/class-rest.php';
require_once __DIR__ . '/includes/class-events.php';
require_once __DIR__ . '/includes/class-admin.php';

SEO_Platform_Output::register();
SEO_Platform_Rest::register();
SEO_Platform_Events::register();
SEO_Platform_Admin::register();
