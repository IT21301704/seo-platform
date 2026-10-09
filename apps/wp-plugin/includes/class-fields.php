<?php
/**
 * Reads and writes the fields SEO Platform can change. Values are normalised so the platform can
 * store them as the "old value" and restore them exactly on rollback:
 *   title, description, canonical, image_alt: string|null (null = not set)
 *   noindex, sitemap_exclude: bool
 *   post_content: string
 *   redirect: {to, status}|null
 *   robots_lines: string[]
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class SEO_Platform_Fields {
	const REDIRECTS = 'seo_platform_redirects';
	const ROBOTS    = 'seo_platform_robots_lines';
	const EXCLUDE   = 'seo_platform_sitemap_exclude';
	const FIELDS    = array( 'title', 'description', 'noindex', 'canonical', 'image_alt', 'post_content', 'redirect', 'robots_lines', 'sitemap_exclude' );

	/** True while a write from SEO Platform runs (no "content changed" event for our own edits). */
	public static $writing = false;

	// ─── Resolving refs ────────────────────────────────────────────────────────

	/** @return array{type:string,id:int}|null  type: post | home */
	public static function resolve_url( $url ) {
		$url = (string) $url;
		if ( '' === $url ) {
			return null;
		}
		$home = untrailingslashit( home_url( '/' ) );
		if ( untrailingslashit( strtok( $url, '?#' ) ) === $home ) {
			$front = (int) get_option( 'page_on_front' );
			if ( 'page' === get_option( 'show_on_front' ) && $front ) {
				return array( 'type' => 'post', 'id' => $front );
			}
			return array( 'type' => 'home', 'id' => 0 );
		}
		$id = url_to_postid( $url );
		if ( ! $id ) {
			$posts_page = (int) get_option( 'page_for_posts' );
			if ( $posts_page && untrailingslashit( get_permalink( $posts_page ) ) === untrailingslashit( $url ) ) {
				$id = $posts_page;
			}
		}
		return $id ? array( 'type' => 'post', 'id' => (int) $id ) : null;
	}

	public static function attachment_for( $src ) {
		$src = (string) $src;
		if ( '' === $src ) {
			return 0;
		}
		if ( 0 === strpos( $src, '/' ) && 0 !== strpos( $src, '//' ) ) {
			$src = home_url( $src );
		}
		$id = attachment_url_to_postid( $src );
		if ( ! $id ) {
			$full = preg_replace( '/-(\d+x\d+|scaled)(\.[a-z0-9]+)$/i', '$2', $src );
			$id   = attachment_url_to_postid( $full );
		}
		return (int) $id;
	}

	public static function redirect_key( $from ) {
		$path = wp_parse_url( (string) $from, PHP_URL_PATH );
		$q    = wp_parse_url( (string) $from, PHP_URL_QUERY );
		$path = '/' . ltrim( (string) $path, '/' );
		return $q ? $path . '?' . $q : $path;
	}

	// ─── Read ──────────────────────────────────────────────────────────────────

	/** @return array{value:mixed,error:?string,resolved:?string} */
	public static function read( $field, array $ref ) {
		if ( ! in_array( $field, self::FIELDS, true ) ) {
			return self::result( null, 'unsupported' );
		}
		switch ( $field ) {
			case 'image_alt':
				$id = self::attachment_for( $ref['src'] ?? '' );
				if ( ! $id ) {
					return self::result( null, 'not_found' );
				}
				return self::result( self::str( get_post_meta( $id, '_wp_attachment_image_alt', true ) ), null, "attachment $id" );
			case 'redirect':
				$map = get_option( self::REDIRECTS, array() );
				$key = self::redirect_key( $ref['from'] ?? '' );
				return self::result( isset( $map[ $key ] ) ? $map[ $key ] : null, null, "redirect $key" );
			case 'robots_lines':
				return self::result( array_values( (array) get_option( self::ROBOTS, array() ) ), null, 'robots.txt' );
		}

		$target = self::resolve_url( $ref['url'] ?? '' );
		if ( ! $target ) {
			return self::result( null, 'not_found' );
		}
		$label = 'home' === $target['type'] ? 'home' : get_post_type( $target['id'] ) . ' ' . $target['id'];
		if ( 'home' === $target['type'] ) {
			if ( 'title' === $field || 'description' === $field ) {
				list( $option, $key ) = SEO_Platform_Seo_Plugins::home_option( $field );
				$values = get_option( $option, array() );
				return self::result( self::str( is_array( $values ) && isset( $values[ $key ] ) ? $values[ $key ] : '' ), null, $label );
			}
			return self::result( null, 'unsupported', $label );
		}

		$id = $target['id'];
		switch ( $field ) {
			case 'title':
			case 'description':
			case 'canonical':
				return self::result( self::str( get_post_meta( $id, SEO_Platform_Seo_Plugins::meta_key( $field ), true ) ), null, $label );
			case 'noindex':
				return self::result( self::read_noindex( $id ), null, $label );
			case 'post_content':
				return self::result( (string) get_post_field( 'post_content', $id, 'raw' ), null, $label );
			case 'sitemap_exclude':
				return self::result( in_array( $id, self::excluded_ids(), true ), null, $label );
		}
		return self::result( null, 'unsupported' );
	}

	private static function read_noindex( $id ) {
		$key = SEO_Platform_Seo_Plugins::meta_key( 'noindex' );
		$raw = get_post_meta( $id, $key, true );
		switch ( SEO_Platform_Seo_Plugins::active() ) {
			case 'yoast':
				if ( '1' === (string) $raw ) {
					return true;
				}
				if ( '2' === (string) $raw ) {
					return false;
				}
				$titles = get_option( 'wpseo_titles', array() );
				return ! empty( $titles[ 'noindex-' . get_post_type( $id ) ] );
			case 'rankmath':
				return is_array( $raw ) && in_array( 'noindex', $raw, true );
			default:
				if ( '1' === (string) $raw ) {
					return true;
				}
				if ( '0' === (string) $raw ) {
					return false;
				}
				return '0' === (string) get_option( 'blog_public' );
		}
	}

	// ─── Write ─────────────────────────────────────────────────────────────────

	/**
	 * Writes $value when the current value equals $expect (else "conflict": someone changed it
	 * since the preview). Returns the previous value.
	 *
	 * @return array{ok:bool,previous:mixed,error:?string}
	 */
	public static function write( $field, array $ref, $value, $expect ) {
		$current = self::read( $field, $ref );
		if ( null !== $current['error'] ) {
			return array( 'ok' => false, 'previous' => null, 'error' => $current['error'] );
		}
		if ( ! self::same( $current['value'], $expect ) ) {
			return array( 'ok' => false, 'previous' => $current['value'], 'error' => 'conflict' );
		}
		$error = self::store( $field, $ref, $value );
		if ( $error ) {
			return array( 'ok' => false, 'previous' => $current['value'], 'error' => $error );
		}
		return array( 'ok' => true, 'previous' => $current['value'], 'error' => null );
	}

	private static function store( $field, array $ref, $value ) {
		switch ( $field ) {
			case 'image_alt':
				$id = self::attachment_for( $ref['src'] ?? '' );
				return self::set_meta( $id, '_wp_attachment_image_alt', self::clean_text( $value ) );
			case 'redirect':
				$map = (array) get_option( self::REDIRECTS, array() );
				$key = self::redirect_key( $ref['from'] ?? '' );
				if ( null === $value ) {
					unset( $map[ $key ] );
				} else {
					$to = esc_url_raw( (string) ( $value['to'] ?? '' ) );
					if ( ! $to ) {
						return 'invalid_value';
					}
					$status       = in_array( (int) ( $value['status'] ?? 301 ), array( 301, 302, 307, 308 ), true ) ? (int) $value['status'] : 301;
					$map[ $key ] = array( 'to' => $to, 'status' => $status );
				}
				update_option( self::REDIRECTS, $map, true );
				return null;
			case 'robots_lines':
				$lines = array();
				foreach ( (array) $value as $line ) {
					$line = trim( preg_replace( '/[\r\n]+/', ' ', (string) $line ) );
					if ( '' !== $line ) {
						$lines[] = $line;
					}
				}
				update_option( self::ROBOTS, $lines, true );
				return null;
		}

		$target = self::resolve_url( $ref['url'] ?? '' );
		if ( ! $target ) {
			return 'not_found';
		}
		if ( 'home' === $target['type'] ) {
			if ( 'title' !== $field && 'description' !== $field ) {
				return 'unsupported';
			}
			list( $option, $key ) = SEO_Platform_Seo_Plugins::home_option( $field );
			$values = get_option( $option, array() );
			$values = is_array( $values ) ? $values : array();
			$text   = self::clean_text( $value );
			if ( null === $text ) {
				unset( $values[ $key ] );
			} else {
				$values[ $key ] = $text;
			}
			update_option( $option, $values );
			return null;
		}

		$id = $target['id'];
		switch ( $field ) {
			case 'title':
			case 'description':
				return self::set_meta( $id, SEO_Platform_Seo_Plugins::meta_key( $field ), self::clean_text( $value ) );
			case 'canonical':
				return self::set_meta( $id, SEO_Platform_Seo_Plugins::meta_key( $field ), null === $value ? null : esc_url_raw( (string) $value ) );
			case 'noindex':
				return self::write_noindex( $id, (bool) $value );
			case 'post_content':
				return self::write_content( $id, (string) $value );
			case 'sitemap_exclude':
				$ids = array_values( array_diff( self::excluded_ids(), array( $id ) ) );
				if ( $value ) {
					$ids[] = $id;
				}
				sort( $ids );
				update_option( self::EXCLUDE, $ids, true );
				return null;
		}
		return 'unsupported';
	}

	private static function write_noindex( $id, $noindex ) {
		$key = SEO_Platform_Seo_Plugins::meta_key( 'noindex' );
		switch ( SEO_Platform_Seo_Plugins::active() ) {
			case 'yoast':
				update_post_meta( $id, $key, $noindex ? '1' : '2' );
				return null;
			case 'rankmath':
				$robots = get_post_meta( $id, $key, true );
				$robots = is_array( $robots ) ? $robots : array();
				$robots = array_values( array_diff( $robots, array( 'index', 'noindex' ) ) );
				array_unshift( $robots, $noindex ? 'noindex' : 'index' );
				update_post_meta( $id, $key, $robots );
				return null;
			default:
				update_post_meta( $id, $key, $noindex ? '1' : '0' );
				return null;
		}
	}

	private static function write_content( $id, $content ) {
		// The content was read from this database and only link targets changed; skip kses so the
		// stored bytes are exactly what the platform saved as old and new values (rollback).
		$kses = has_filter( 'content_save_pre', 'wp_filter_post_kses' );
		if ( $kses ) {
			kses_remove_filters();
		}
		$result = wp_update_post( wp_slash( array( 'ID' => $id, 'post_content' => $content ) ), true );
		if ( $kses ) {
			kses_init_filters();
		}
		return is_wp_error( $result ) ? 'write_failed' : null;
	}

	private static function set_meta( $id, $key, $value ) {
		if ( ! $id ) {
			return 'not_found';
		}
		if ( null === $value ) {
			delete_post_meta( $id, $key );
		} else {
			update_post_meta( $id, $key, wp_slash( $value ) );
		}
		return null;
	}

	// ─── Helpers ───────────────────────────────────────────────────────────────

	public static function excluded_ids() {
		return array_map( 'intval', (array) get_option( self::EXCLUDE, array() ) );
	}

	private static function str( $v ) {
		$v = is_string( $v ) ? $v : '';
		return '' === $v ? null : $v;
	}

	private static function clean_text( $v ) {
		if ( null === $v ) {
			return null;
		}
		$v = trim( preg_replace( '/\s+/', ' ', wp_strip_all_tags( (string) $v ) ) );
		return '' === $v ? null : $v;
	}

	public static function same( $a, $b ) {
		return wp_json_encode( $a ) === wp_json_encode( $b );
	}

	private static function result( $value, $error, $resolved = null ) {
		return array( 'value' => $value, 'error' => $error, 'resolved' => $resolved );
	}
}
