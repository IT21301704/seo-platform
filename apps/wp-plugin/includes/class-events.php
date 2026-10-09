<?php
/**
 * Signed webhooks to SEO Platform when content changes (REQUIREMENTS C2: page.updated /
 * page.deleted → re-check). Changes made by SEO Platform itself are not reported back.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class SEO_Platform_Events {
	const ROUTE = '/v1/wordpress/events';

	public static function register() {
		add_action( 'save_post', array( __CLASS__, 'saved' ), 20, 3 );
		add_action( 'wp_trash_post', array( __CLASS__, 'removed' ) );
		add_action( 'before_delete_post', array( __CLASS__, 'removed' ) );
	}

	private static function reportable( $post ) {
		if ( SEO_Platform_Fields::$writing || ! $post || wp_is_post_revision( $post ) || wp_is_post_autosave( $post ) ) {
			return false;
		}
		$type = get_post_type_object( $post->post_type );
		return $type && $type->public && 'attachment' !== $post->post_type;
	}

	public static function saved( $post_id, $post, $update ) {
		if ( ! self::reportable( $post ) || 'publish' !== $post->post_status ) {
			return;
		}
		self::send( 'page.updated', get_permalink( $post ), $post_id, $post->post_modified_gmt );
	}

	public static function removed( $post_id ) {
		$post = get_post( $post_id );
		if ( ! self::reportable( $post ) || 'publish' !== $post->post_status ) {
			return;
		}
		self::send( 'page.deleted', get_permalink( $post ), $post_id, gmdate( 'Y-m-d H:i:s' ) );
	}

	/** Fire-and-forget signed POST. */
	public static function send( $event, $url, $post_id, $modified ) {
		$connection = SEO_Platform_Connection::get();
		$app        = SEO_Platform_Connection::app_url();
		if ( ! $connection || ! $app ) {
			return;
		}
		$body = wp_json_encode(
			array(
				'event'    => $event,
				'url'      => $url,
				'postId'   => (int) $post_id,
				'modified' => $modified,
				'site'     => trailingslashit( home_url( '/' ) ),
			)
		);
		$headers                 = SEO_Platform_Signature::headers( $connection['key'], $connection['secret'], 'POST', self::ROUTE, $body );
		$headers['content-type'] = 'application/json';
		wp_remote_post(
			$app . self::ROUTE,
			array(
				'headers'  => $headers,
				'body'     => $body,
				'timeout'  => 3,
				'blocking' => false,
			)
		);
	}
}
