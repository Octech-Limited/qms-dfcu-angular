export function generateCSPNonce(): string {
	const array = new Uint8Array(16);
	crypto.getRandomValues(array);
	return btoa(String.fromCharCode(...array));
}

const SCRIPT_HOSTS = "'self' https://www.youtube.com https://youtube.com https://www.gstatic.com";

function sharedDirectives(): string[] {
	return [
		"default-src 'self'",
		"script-src-attr 'none'",
		"style-src-attr 'unsafe-inline'",
		"font-src 'self' data:",
		"img-src 'self' data:",
		"media-src 'self' https://www.youtube.com",
		"frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
		"connect-src 'self' https://vms.nesscom.net:8443",
		"worker-src 'self' blob:",
		"manifest-src 'self'",
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'"
	];
}

function scriptSrc(nonce?: string): string {
	const isDev = process.env['NODE_ENV'] === 'development';
	const parts = [
		SCRIPT_HOSTS,
		...(nonce ? [`'nonce-${nonce}'`] : []),
		...(isDev ? ["'unsafe-eval'", "'unsafe-inline'"] : [])
	];
	return `script-src ${parts.join(' ')}`;
}

function styleSrc(nonce?: string): string {
	const isDev = process.env['NODE_ENV'] === 'development';
	if (isDev) return "style-src 'self' 'unsafe-inline'";
	const parts = ["'self'", ...(nonce ? [`'nonce-${nonce}'`] : [])];
	return `style-src ${parts.join(' ')}`;
}

/**
 * Beasties/critical-CSS often emits:
 *   <link rel="stylesheet" href="..." media="print" onload="this.media='all'">
 * Our CSP sets script-src-attr 'none', so that onload never runs and Tailwind
 * utilities stay on media=print only — page looks unstyled/distorted.
 * Promote those links to media=all before the browser paints.
 */
function promoteDeferredStylesheets(html: string): string {
	return html.replace(/<link\b[^>]*>/gi, (tag) => {
		if (!/\brel\s*=\s*(["'])stylesheet\1/i.test(tag)) return tag;
		if (!/\bmedia\s*=\s*(["'])print\1/i.test(tag)) return tag;
		if (!/\bonload\s*=/i.test(tag)) return tag;
		return tag
			.replace(/\s+onload\s*=\s*"[^"]*"/i, '')
			.replace(/\s+onload\s*=\s*'[^']*'/i, '')
			.replace(/\bmedia\s*=\s*(["'])print\1/i, 'media="all"');
	});
}

export function applyCspNonces(html: string, nonce: string): string {
	const withMeta = html.includes('property="csp-nonce"')
		? html
		: html.replace(/<head([^>]*)>/i, `<head$1>\n\t\t<meta property="csp-nonce" nonce="${nonce}" />`);
	return promoteDeferredStylesheets(withMeta)
		.replace(/<script(?![^>]*\bnonce=)/gi, `<script nonce="${nonce}"`)
		.replace(/<style(?![^>]*\bnonce=)/gi, `<style nonce="${nonce}"`);
}

export function buildCSPHeader(nonce: string): string {
	return [scriptSrc(nonce), styleSrc(nonce), ...sharedDirectives()].join('; ');
}

export function getSecurityHeaders(isApi = false): Record<string, string> {
	return {
		'X-Frame-Options': 'DENY',
		'X-Content-Type-Options': 'nosniff',
		'X-XSS-Protection': '0',
		'Referrer-Policy': 'strict-origin-when-cross-origin',
		'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
		'X-Permitted-Cross-Domain-Policies': 'none',
		'Cross-Origin-Opener-Policy': 'same-origin',
		'Cross-Origin-Resource-Policy': isApi ? 'cross-origin' : 'same-origin',
		'Cross-Origin-Embedder-Policy': 'unsafe-none',
		'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
	};
}
