<?php
/**
 * Detects which plugin generates titles, descriptions, robots, canonicals and the sitemap, so
 * fixes are written where that plugin reads them ("fix the generator, not the output").
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class SEO_Platform_Seo_Plugins {
	/** @return string yoast | rankmath | core */
	public static function active() {
		if ( defined( 'WPSEO_VERSION' ) ) {
			return 'yoast';
		}
		if ( defined( 'RANK_MATH_VERSION' ) || class_exists( '\\RankMath\\Helper' ) ) {
			return 'rankmath';
		}
		return 'core';
	}

	public static function version() {
		if ( defined( 'WPSEO_VERSION' ) ) {
			return WPSEO_VERSION;
		}
		if ( defined( 'RANK_MATH_VERSION' ) ) {
			return RANK_MATH_VERSION;
		}
		return null;
	}

	/**
	 * Whether the active SEO plugin outputs its tags. Rank Math outputs nothing until its setup
	 * wizard is finished or its account step skipped.
	 */
	public static function ready() {
		if ( 'rankmath' === self::active() && class_exists( '\\RankMath\\Helper' ) && method_exists( '\\RankMath\\Helper', 'is_invalid_registration' ) ) {
			return ! \RankMath\Helper::is_invalid_registration();
		}
		return true;
	}

	/** @return string core | yoast | rankmath | none */
	public static function sitemap() {
		$seo = self::active();
		if ( 'yoast' === $seo && class_exists( 'WPSEO_Options' ) && WPSEO_Options::get( 'enable_xml_sitemap' ) ) {
			return 'yoast';
		}
		if ( 'rankmath' === $seo && class_exists( '\\RankMath\\Helper' ) && \RankMath\Helper::is_module_active( 'sitemap' ) ) {
			return 'rankmath';
		}
		if ( function_exists( 'wp_sitemaps_get_server' ) && wp_sitemaps_get_server()->sitemaps_enabled() ) {
			return 'core';
		}
		return 'none';
	}

	/** Post meta keys per SEO plugin. */
	public static function meta_key( $field ) {
		$keys = array(
			'yoast'    => array(
				'title'       => '_yoast_wpseo_title',
				'description' => '_yoast_wpseo_metadesc',
				'canonical'   => '_yoast_wpseo_canonical',
				'noindex'     => '_yoast_wpseo_meta-robots-noindex',
			),
			'rankmath' => array(
				'title'       => 'rank_math_title',
				'description' => 'rank_math_description',
				'canonical'   => 'rank_math_canonical_url',
				'noindex'     => 'rank_math_robots',
			),
			'core'     => array(
				'title'       => '_seo_platform_title',
				'description' => '_seo_platform_description',
				'canonical'   => '_seo_platform_canonical',
				'noindex'     => '_seo_platform_noindex',
			),
		);
		return $keys[ self::active() ][ $field ];
	}

	/**
	 * Option + array key holding the blog home page's title/description (front page shows posts).
	 *
	 * @return array{0:string,1:string}
	 */
	public static function home_option( $field ) {
		$seo = self::active();
		if ( 'yoast' === $seo ) {
			return array( 'wpseo_titles', 'title' === $field ? 'title-home-wpseo' : 'metadesc-home-wpseo' );
		}
		if ( 'rankmath' === $seo ) {
			return array( 'rank-math-options-titles', 'title' === $field ? 'homepage_title' : 'homepage_description' );
		}
		return array( 'seo_platform_home', $field );
	}
}
