/**
 * Client-visible config (mirrors Next NEXT_PUBLIC_* values).
 * Sent as x-rating-token on public feedback / rating API calls.
 */
export const RATING_API_SECRET = 'Ihavekeptitasecret';

export function ratingHeaders(): Record<string, string> {
	return RATING_API_SECRET ? { 'x-rating-token': RATING_API_SECRET } : {};
}
