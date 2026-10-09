<?php
/**
 * Checks the PHP signature against the vector in packages/integrations (no WordPress needed):
 *   php apps/wp-plugin/tests/signature-test.php
 * In Docker: docker compose exec wordpress php wp-content/plugins/seo-platform/tests/signature-test.php
 */

define( 'SEO_PLATFORM_CLI_TEST', true );
require __DIR__ . '/../includes/class-signature.php';

$secret = 'test-secret-0123456789abcdef';
$nonce  = '00112233445566778899aabbccddeeff';
$route  = '/seo-platform/v1/write';
$body   = '{"items":[]}';
$failed = 0;

function check( $name, $actual, $expected ) {
	global $failed;
	if ( $actual === $expected ) {
		echo "ok   $name\n";
	} else {
		$failed++;
		echo "FAIL $name\n  expected: " . var_export( $expected, true ) . "\n  actual:   " . var_export( $actual, true ) . "\n";
	}
}

// Same value as packages/integrations/src/wordpress/signing.test.ts produces.
check(
	'signature matches the TypeScript implementation',
	SEO_Platform_Signature::sign( $secret, '1790503200', $nonce, 'post', $route, $body ),
	'v1=60559a39e752128a008aa5cb97a1ba14b800ad53a3a279e2f9ac942fce142f89'
);

$headers = array(
	'x-seo-key'       => 'int_1',
	'x-seo-timestamp' => '1790503200',
	'x-seo-nonce'     => $nonce,
	'x-seo-signature' => SEO_Platform_Signature::sign( $secret, '1790503200', $nonce, 'POST', $route, $body ),
);
$never = function () { return false; };
$always = function () { return true; };

check( 'valid request', SEO_Platform_Signature::verify( $secret, 'int_1', $headers, 'POST', $route, $body, 1790503200, $never ), true );
check( 'changed body', SEO_Platform_Signature::verify( $secret, 'int_1', $headers, 'POST', $route, '{}', 1790503200, $never ), 'bad-signature' );
check( 'wrong key id', SEO_Platform_Signature::verify( $secret, 'int_2', $headers, 'POST', $route, $body, 1790503200, $never ), 'unknown-key' );
check( 'too old', SEO_Platform_Signature::verify( $secret, 'int_1', $headers, 'POST', $route, $body, 1790503200 + 301, $never ), 'expired' );
check( 'replayed nonce', SEO_Platform_Signature::verify( $secret, 'int_1', $headers, 'POST', $route, $body, 1790503200, $always ), 'replay' );
check( 'missing header', SEO_Platform_Signature::verify( $secret, 'int_1', array(), 'POST', $route, $body, 1790503200, $never ), 'missing' );

exit( $failed ? 1 : 0 );
