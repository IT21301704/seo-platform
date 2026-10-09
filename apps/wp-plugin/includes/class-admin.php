<?php
/**
 * Settings → SEO Platform: paste the connection key, see what is connected, disconnect.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class SEO_Platform_Admin {
	const PAGE = 'seo-platform';

	public static function register() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_post_seo_platform_connect', array( __CLASS__, 'connect' ) );
		add_action( 'admin_post_seo_platform_disconnect', array( __CLASS__, 'disconnect' ) );
	}

	public static function menu() {
		add_options_page( 'SEO Platform', 'SEO Platform', 'manage_options', self::PAGE, array( __CLASS__, 'render' ) );
	}

	private static function back( $message ) {
		wp_safe_redirect( add_query_arg( array( 'page' => self::PAGE, 'seo_platform_msg' => rawurlencode( $message ) ), admin_url( 'options-general.php' ) ) );
		exit;
	}

	public static function connect() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Not allowed.', 'seo-platform' ) );
		}
		check_admin_referer( 'seo_platform_connect' );
		$result = SEO_Platform_Connection::save_key( wp_unslash( $_POST['connection_key'] ?? '' ) ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		self::back( true === $result ? __( 'Connected. Go back to SEO Platform and press "Check connection".', 'seo-platform' ) : $result );
	}

	public static function disconnect() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Not allowed.', 'seo-platform' ) );
		}
		check_admin_referer( 'seo_platform_disconnect' );
		SEO_Platform_Connection::delete();
		self::back( __( 'Disconnected. Fixes already published stay in place.', 'seo-platform' ) );
	}

	public static function render() {
		$connection = SEO_Platform_Connection::get();
		$message    = isset( $_GET['seo_platform_msg'] ) ? sanitize_text_field( wp_unslash( $_GET['seo_platform_msg'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
		$log        = (array) get_option( 'seo_platform_log', array() );
		?>
		<div class="wrap">
			<h1>SEO Platform</h1>
			<?php if ( $message ) : ?>
				<div class="notice notice-info"><p><?php echo esc_html( $message ); ?></p></div>
			<?php endif; ?>
			<p><?php esc_html_e( 'SEO Platform publishes only the fixes you approve in the app. It saves the old value first, so every change can be rolled back from the Change log.', 'seo-platform' ); ?></p>
			<table class="form-table" role="presentation">
				<tr><th><?php esc_html_e( 'Status', 'seo-platform' ); ?></th><td><?php echo $connection ? esc_html__( 'Connected', 'seo-platform' ) : esc_html__( 'Not connected', 'seo-platform' ); ?></td></tr>
				<?php if ( $connection ) : ?>
					<tr><th><?php esc_html_e( 'App', 'seo-platform' ); ?></th><td><code><?php echo esc_html( SEO_Platform_Connection::app_url() ); ?></code></td></tr>
				<?php endif; ?>
				<tr><th><?php esc_html_e( 'SEO plugin', 'seo-platform' ); ?></th><td><?php echo esc_html( array( 'yoast' => 'Yoast SEO', 'rankmath' => 'Rank Math', 'core' => __( 'None (this plugin outputs titles and descriptions)', 'seo-platform' ) )[ SEO_Platform_Seo_Plugins::active() ] ); ?></td></tr>
				<tr><th><?php esc_html_e( 'Sitemap', 'seo-platform' ); ?></th><td><?php echo esc_html( SEO_Platform_Seo_Plugins::sitemap() ); ?></td></tr>
			</table>

			<?php if ( ! $connection ) : ?>
				<h2><?php esc_html_e( 'Connect', 'seo-platform' ); ?></h2>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
					<?php wp_nonce_field( 'seo_platform_connect' ); ?>
					<input type="hidden" name="action" value="seo_platform_connect" />
					<p><label for="seo-platform-key"><?php esc_html_e( 'Connection key (from SEO Platform → Integrations → WordPress)', 'seo-platform' ); ?></label></p>
					<textarea id="seo-platform-key" name="connection_key" rows="3" class="large-text code" required></textarea>
					<?php submit_button( __( 'Connect', 'seo-platform' ) ); ?>
				</form>
			<?php else : ?>
				<h2><?php esc_html_e( 'Recent changes from SEO Platform', 'seo-platform' ); ?></h2>
				<?php if ( ! $log ) : ?>
					<p><?php esc_html_e( 'None yet.', 'seo-platform' ); ?></p>
				<?php else : ?>
					<ul>
						<?php foreach ( $log as $entry ) : ?>
							<li><?php echo esc_html( wp_date( 'Y-m-d H:i', (int) $entry['time'] ) . ' · ' . (int) $entry['changes'] . ' ' . __( 'changes', 'seo-platform' ) ); ?></li>
						<?php endforeach; ?>
					</ul>
				<?php endif; ?>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
					<?php wp_nonce_field( 'seo_platform_disconnect' ); ?>
					<input type="hidden" name="action" value="seo_platform_disconnect" />
					<?php submit_button( __( 'Disconnect', 'seo-platform' ), 'secondary' ); ?>
				</form>
			<?php endif; ?>
		</div>
		<?php
	}
}
