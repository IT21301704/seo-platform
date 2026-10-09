<?php
/**
 * HMAC request signing, identical to packages/integrations/src/wordpress/signing.ts.
 *
 * Base string: timestamp \n nonce \n METHOD \n route \n sha256(body)
 * Header:      x-seo-signature: v1=<hex hmac-sha256>
 */

if ( ! defined( 'ABSPATH' ) && ! defined( 'SEO_PLATFORM_CLI_TEST' ) ) {
	exit;
}

class SEO_Platform_Signature {
	const VERSION     = 'v1';
	const MAX_SKEW    = 300;
	const NONCE_TTL   = 600;

	public static function base( $timestamp, $nonce, $method, $route, $body ) {
		return implode(
			"\n",
			array( (string) $timestamp, (string) $nonce, strtoupper( $method ), $route, hash( 'sha256', (string) $body ) )
		);
	}

	public static function sign( $secret, $timestamp, $nonce, $method, $route, $body ) {
		return self::VERSION . '=' . hash_hmac( 'sha256', self::base( $timestamp, $nonce, $method, $route, $body ), $secret );
	}

	/** Headers for an outgoing signed request (events sent to SEO Platform). */
	public static function headers( $key_id, $secret, $method, $route, $body, $now = null ) {
		$timestamp = (string) ( null === $now ? time() : $now );
		$nonce     = bin2hex( random_bytes( 16 ) );
		return array(
			'x-seo-key'       => $key_id,
			'x-seo-timestamp' => $timestamp,
			'x-seo-nonce'     => $nonce,
			'x-seo-signature' => self::sign( $secret, $timestamp, $nonce, $method, $route, $body ),
		);
	}

	/**
	 * Verifies an incoming request. Returns true or an error code string.
	 *
	 * @param callable $seen Returns true when the nonce was already used (replay), else records it.
	 */
	public static function verify( $secret, $key_id, array $headers, $method, $route, $body, $now, $seen ) {
		foreach ( array( 'x-seo-key', 'x-seo-timestamp', 'x-seo-nonce', 'x-seo-signature' ) as $name ) {
			if ( empty( $headers[ $name ] ) ) {
				return 'missing';
			}
		}
		if ( ! hash_equals( (string) $key_id, (string) $headers['x-seo-key'] ) ) {
			return 'unknown-key';
		}
		if ( ! ctype_digit( (string) $headers['x-seo-timestamp'] ) || abs( $now - (int) $headers['x-seo-timestamp'] ) > self::MAX_SKEW ) {
			return 'expired';
		}
		$expected = self::sign( $secret, $headers['x-seo-timestamp'], $headers['x-seo-nonce'], $method, $route, $body );
		if ( ! hash_equals( $expected, (string) $headers['x-seo-signature'] ) ) {
			return 'bad-signature';
		}
		if ( call_user_func( $seen, (string) $headers['x-seo-nonce'] ) ) {
			return 'replay';
		}
		return true;
	}
}
