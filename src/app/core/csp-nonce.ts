/** Nonce stamped on `<app-root ngCspNonce>` for this document. Empty during SSR, before the server adds it. */
export function cspNonceAttr(): string | null {
	if (typeof document === 'undefined') return null;
	const root = document.querySelector('[ngCspNonce]');
	const nonce = root?.getAttribute('ngCspNonce')?.trim();
	return nonce || null;
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Keep dynamic colors inside a nonce-backed stylesheet instead of a style attribute. */
export function cssColor(value: string | null | undefined, fallback: string): string {
	const color = (value ?? '').trim();
	return HEX_COLOR.test(color) ? color : fallback;
}

export function cssIdent(value: string): string {
	const ident = value.replace(/[^a-zA-Z0-9_-]/g, '');
	return ident || 'x';
}
