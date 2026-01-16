/**
 * Number formatting utilities for dashboard display
 * @packageDocumentation
 */

/**
 * Format large numbers with K/M suffixes for compact display
 * @example
 * formatNumber(999) // "999"
 * formatNumber(1000) // "1K"
 * formatNumber(1500) // "1.5K"
 * formatNumber(2739700) // "2.7M"
 */
export function formatNumber(num: number): string {
	if (num >= 1_000_000) {
		const val = num / 1_000_000;
		return val % 1 === 0 ? `${val}M` : `${val.toFixed(1)}M`;
	}
	if (num >= 1_000) {
		const val = num / 1_000;
		return val % 1 === 0 ? `${val}K` : `${val.toFixed(1)}K`;
	}
	return num.toString();
}
