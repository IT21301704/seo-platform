<?php
/**
 * Front-end output: makes the stored values take effect where WordPress (or the SEO plugin)
 * generates the page, sitemap and robots.txt.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class SEO_Platform_Output {
	public static function register() {
		add_action( 'template_redirect', array( __CLASS__, 'redirect' ), 0 );
		add_filter( 'robots_txt', array( __CLASS__, 'robots_txt' ), 99, 2 );
		add_filter( 'wp_content_img_tag', array( __CLASS__, 'image_alt' ), 10, 3 );

		// Sitemap exclusions, for whichever plugin generates the sitemap.
		add_filter( 'wp_sitemaps_posts_query_args', array( __CLASS__, 'core_sitemap_args' ) );
		add_filter( 'wpseo_exclude_from_sitemap_by_post_ids', array( __CLASS__, 'yoast_excluded' ) );
		add_filter( 'rank_math/sitemap/entry', array( __CLASS__, 'rank_math_entry' ), 10, 3 );

		// Our own meta output only when no SEO plugin handles it.
		add_action(
			'plugins_loaded',
			function () {
				if ( 'core' !== SEO_Platform_Seo_Plugins::active() ) {
					return;
				}
				add_filter( 'pre_get_document_title', array( __CLASS__, 'document_title' ), 20 );
				add_action( 'wp_head', array( __CLASS__, 'meta_description' ), 1 );
				add_filter( 'wp_robots', array( __CLASS__, 'robots_meta' ), 20 );
				add_filter( 'get_canonical_url', array( __CLASS__, 'canonical' ), 20, 2 );
			}
		);
	}

	// ─── Redirects ─────────────────────────────────────────────────────────────

	public static function redirect() {
		$map = get_option( SEO_Platform_Fields::REDIRECTS, array() );
		if ( empty( $map ) || ! isset( $_SERVER['REQUEST_URI'] ) ) {
			return;
		}
		$uri  = wp_unslash( $_SERVER['REQUEST_URI'] ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		$key  = SEO_Platform_Fields::redirect_key( $uri );
		$path = SEO_Platform_Fields::redirect_key( (string) strtok( $uri, '?' ) );
		$hit  = $map[ $key ] ?? $map[ $path ] ?? null;
		if ( $hit && ! empty( $hit['to'] ) ) {
			wp_redirect( $hit['to'], (int) $hit['status'], 'SEO Platform' ); // phpcs:ignore WordPress.Security.SafeRedirect
			exit;
		}
	}

	// ─── robots.txt ────────────────────────────────────────────────────────────

	public static function robots_txt( $output, $public ) {
		$lines = (array) get_option( SEO_Platform_Fields::ROBOTS, array() );
		foreach ( $lines as $line ) {
			if ( false === stripos( $output, $line ) ) {
				$output = rtrim( $output ) . "\n" . $line . "\n";
			}
		}
		return $output;
	}

	// ─── Alt text ──────────────────────────────────────────────────────────────

	/** Adds the media-library alt text to content images that have no alt attribute. */
	public static function image_alt( $tag, $context, $attachment_id ) {
		if ( preg_match( '/\salt\s*=/i', $tag ) ) {
			return $tag;
		}
		if ( ! $attachment_id && preg_match( '/\ssrc\s*=\s*["\']([^"\']+)["\']/i', $tag, $m ) ) {
			$attachment_id = SEO_Platform_Fields::attachment_for( html_entity_decode( $m[1] ) );
		}
		$alt = $attachment_id ? (string) get_post_meta( $attachment_id, '_wp_attachment_image_alt', true ) : '';
		if ( '' === $alt ) {
			return $tag;
		}
		return preg_replace( '/^<img\b/i', '<img alt="' . esc_attr( $alt ) . '"', $tag, 1 );
	}

	// ─── Sitemaps ──────────────────────────────────────────────────────────────

	public static function core_sitemap_args( $args ) {
		$ids = SEO_Platform_Fields::excluded_ids();
		if ( $ids ) {
			$args['post__not_in'] = array_merge( $args['post__not_in'] ?? array(), $ids );
		}
		return $args;
	}

	public static function yoast_excluded( $ids ) {
		return array_values( array_unique( array_merge( (array) $ids, SEO_Platform_Fields::excluded_ids() ) ) );
	}

	public static function rank_math_entry( $url, $type, $object ) {
		if ( 'post' === $type && is_object( $object ) && isset( $object->ID ) && in_array( (int) $object->ID, SEO_Platform_Fields::excluded_ids(), true ) ) {
			return false;
		}
		return $url;
	}

	// ─── Standalone meta (no Yoast / Rank Math) ────────────────────────────────

	private static function value( $field ) {
		if ( is_front_page() && is_home() ) {
			$home = get_option( 'seo_platform_home', array() );
			return is_array( $home ) && ! empty( $home[ $field ] ) ? (string) $home[ $field ] : '';
		}
		if ( is_singular() ) {
			return (string) get_post_meta( get_queried_object_id(), SEO_Platform_Seo_Plugins::meta_key( $field ), true );
		}
		return '';
	}

	public static function document_title( $title ) {
		$custom = self::value( 'title' );
		return '' !== $custom ? $custom : $title;
	}

	public static function meta_description() {
		$description = self::value( 'description' );
		if ( '' !== $description ) {
			echo '<meta name="description" content="' . esc_attr( $description ) . '" />' . "\n";
		}
	}

	public static function robots_meta( array $robots ) {
		if ( ! is_singular() ) {
			return $robots;
		}
		$flag = (string) get_post_meta( get_queried_object_id(), SEO_Platform_Seo_Plugins::meta_key( 'noindex' ), true );
		if ( '1' === $flag ) {
			$robots['noindex'] = true;
		} elseif ( '0' === $flag ) {
			unset( $robots['noindex'] );
		}
		return $robots;
	}

	public static function canonical( $url, $post ) {
		$custom = $post ? (string) get_post_meta( $post->ID, SEO_Platform_Seo_Plugins::meta_key( 'canonical' ), true ) : '';
		return '' !== $custom ? $custom : $url;
	}
}
