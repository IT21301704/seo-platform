<?php
/**
 * The connection to SEO Platform: app URL, key id and signing secret, pasted by the site owner as
 * one "connection key" (seowp_...). Stored in a non-autoloaded option, never shown again.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class SEO_Platform_Connection {
	const OPTION = 'seo_platform_connection';

	/** @return array{app:string,key:string,secret:string}|null */
	public static function get() {
		$value = get_option( self::OPTION );
		if ( ! is_array( $value ) || empty( $value['key'] ) || empty( $value['secret'] ) || empty( $value['app'] ) ) {
			return null;
		}
		return $value;
	}

	/** Decodes "seowp_<base64url json>" and saves it. Returns true or an error message. */
	public static function save_key( $text ) {
		$text = trim( (string) $text );
		if ( 0 !== strpos( $text, 'seowp_' ) ) {
			return __( 'This is not an SEO Platform connection key (it starts with seowp_).', 'seo-platform' );
		}
		$b64  = strtr( substr( $text, 6 ), '-_', '+/' );
		$json = base64_decode( $b64 . str_repeat( '=', ( 4 - strlen( $b64 ) % 4 ) % 4 ), true );
		$data = is_string( $json ) ? json_decode( $json, true ) : null;
		if ( ! is_array( $data ) || 1 !== ( $data['v'] ?? null ) || empty( $data['app'] ) || empty( $data['key'] ) || empty( $data['secret'] ) ) {
			return __( 'The connection key could not be read. Copy it again from SEO Platform.', 'seo-platform' );
		}
		$app = esc_url_raw( $data['app'] );
		if ( ! $app ) {
			return __( 'The connection key has an invalid app address.', 'seo-platform' );
		}
		update_option(
			self::OPTION,
			array(
				'app'    => untrailingslashit( $app ),
				'key'    => sanitize_text_field( $data['key'] ),
				'secret' => (string) $data['secret'],
			),
			false
		);
		return true;
	}

	public static function delete() {
		delete_option( self::OPTION );
	}

	/**
	 * Where events are sent. SEO_PLATFORM_APP_URL in wp-config.php overrides the key's app URL
	 * (local development: the Docker site reaches the app at host.docker.internal).
	 */
	public static function app_url() {
		if ( defined( 'SEO_PLATFORM_APP_URL' ) && SEO_PLATFORM_APP_URL ) {
			return untrailingslashit( SEO_PLATFORM_APP_URL );
		}
		$c = self::get();
		return $c ? $c['app'] : null;
	}
}
