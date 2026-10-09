<?php
/**
 * Signed REST API used by SEO Platform: /seo-platform/v1/status, /read, /write.
 * Every request must carry a valid HMAC signature from the connected platform (no WordPress
 * login is involved); replays are refused.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class SEO_Platform_Rest {
	const NS        = 'seo-platform/v1';
	const MAX_ITEMS = 200;

	public static function register() {
		add_action( 'rest_api_init', array( __CLASS__, 'routes' ) );
	}

	public static function routes() {
		$auth = array( __CLASS__, 'authorize' );
		register_rest_route( self::NS, '/status', array( 'methods' => 'GET', 'callback' => array( __CLASS__, 'status' ), 'permission_callback' => $auth ) );
		register_rest_route( self::NS, '/read', array( 'methods' => 'POST', 'callback' => array( __CLASS__, 'read' ), 'permission_callback' => $auth ) );
		register_rest_route( self::NS, '/write', array( 'methods' => 'POST', 'callback' => array( __CLASS__, 'write' ), 'permission_callback' => $auth ) );
	}

	/** @return true|WP_Error */
	public static function authorize( WP_REST_Request $request ) {
		$connection = SEO_Platform_Connection::get();
		if ( ! $connection ) {
			return new WP_Error( 'seo_platform_not_connected', 'Not connected to SEO Platform', array( 'status' => 401 ) );
		}
		$headers = array();
		foreach ( array( 'x-seo-key', 'x-seo-timestamp', 'x-seo-nonce', 'x-seo-signature' ) as $name ) {
			$headers[ $name ] = (string) $request->get_header( $name );
		}
		$result = SEO_Platform_Signature::verify(
			$connection['secret'],
			$connection['key'],
			$headers,
			$request->get_method(),
			$request->get_route(),
			$request->get_body(),
			time(),
			array( __CLASS__, 'nonce_seen' )
		);
		if ( true !== $result ) {
			return new WP_Error( 'seo_platform_' . str_replace( '-', '_', $result ), 'Signature check failed: ' . $result, array( 'status' => 401 ) );
		}
		return true;
	}

	/** Replay protection: a nonce is accepted once within its lifetime. */
	public static function nonce_seen( $nonce ) {
		$key = 'seo_platform_n_' . md5( $nonce );
		if ( false !== get_transient( $key ) ) {
			return true;
		}
		set_transient( $key, 1, SEO_Platform_Signature::NONCE_TTL );
		return false;
	}

	public static function status() {
		return array(
			'apiVersion'        => SEO_PLATFORM_API_VERSION,
			'pluginVersion'     => SEO_PLATFORM_VERSION,
			'wpVersion'         => get_bloginfo( 'version' ),
			'seoPlugin'         => SEO_Platform_Seo_Plugins::active(),
			'seoPluginVersion'  => SEO_Platform_Seo_Plugins::version(),
			'seoPluginReady'    => SEO_Platform_Seo_Plugins::ready(),
			'homeUrl'           => trailingslashit( home_url( '/' ) ),
			'physicalRobotsTxt' => file_exists( ABSPATH . 'robots.txt' ),
			'sitemap'           => SEO_Platform_Seo_Plugins::sitemap(),
		);
	}

	private static function items( WP_REST_Request $request ) {
		$body  = json_decode( $request->get_body(), true );
		$items = is_array( $body ) && isset( $body['items'] ) && is_array( $body['items'] ) ? $body['items'] : null;
		if ( null === $items || count( $items ) > self::MAX_ITEMS ) {
			return new WP_Error( 'seo_platform_bad_request', 'Expected 1–200 items', array( 'status' => 400 ) );
		}
		return $items;
	}

	public static function read( WP_REST_Request $request ) {
		$items = self::items( $request );
		if ( is_wp_error( $items ) ) {
			return $items;
		}
		$out = array();
		foreach ( $items as $item ) {
			$out[] = SEO_Platform_Fields::read( (string) ( $item['field'] ?? '' ), (array) ( $item['ref'] ?? array() ) );
		}
		return array( 'items' => $out );
	}

	public static function write( WP_REST_Request $request ) {
		$items = self::items( $request );
		if ( is_wp_error( $items ) ) {
			return $items;
		}
		$out                          = array();
		SEO_Platform_Fields::$writing = true;
		foreach ( $items as $item ) {
			$out[] = SEO_Platform_Fields::write(
				(string) ( $item['field'] ?? '' ),
				(array) ( $item['ref'] ?? array() ),
				$item['value'] ?? null,
				$item['expect'] ?? null
			);
		}
		SEO_Platform_Fields::$writing = false;
		self::log( count( array_filter( $out, function ( $r ) { return $r['ok']; } ) ) );
		return array( 'items' => $out );
	}

	/** Last writes, shown on the settings page. */
	private static function log( $count ) {
		$log = (array) get_option( 'seo_platform_log', array() );
		array_unshift( $log, array( 'time' => time(), 'changes' => $count ) );
		update_option( 'seo_platform_log', array_slice( $log, 0, 10 ), false );
	}
}
