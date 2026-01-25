/**
 * Formatting utilities for human-readable display
 *
 * @packageDocumentation
 */

/**
 * Format a number for human-readable display
 *
 * @param value - The number to format
 * @param options - Formatting options
 * @returns Formatted string (e.g., "2.7M", "15K", "342")
 *
 * @example
 * formatNumber(2739700)  // "2.7M"
 * formatNumber(15432)    // "15.4K"
 * formatNumber(342)      // "342"
 * formatNumber(0)        // "0"
 */
export function formatNumber(
	value: number,
	options: {
		/** Number of decimal places (default: 1) */
		decimals?: number;
		/** Always show decimals even if .0 (default: false) */
		forceDecimals?: boolean;
	} = {},
): string {
	const { decimals = 1, forceDecimals = false } = options;

	if (value === 0) {
		return "0";
	}

	const absValue = Math.abs(value);
	const sign = value < 0 ? "-" : "";

	// Billions
	if (absValue >= 1_000_000_000) {
		const formatted = (absValue / 1_000_000_000).toFixed(decimals);
		return `${sign}${forceDecimals ? formatted : stripTrailingZeros(formatted)}B`;
	}

	// Millions
	if (absValue >= 1_000_000) {
		const formatted = (absValue / 1_000_000).toFixed(decimals);
		return `${sign}${forceDecimals ? formatted : stripTrailingZeros(formatted)}M`;
	}

	// Thousands
	if (absValue >= 1_000) {
		const formatted = (absValue / 1_000).toFixed(decimals);
		return `${sign}${forceDecimals ? formatted : stripTrailingZeros(formatted)}K`;
	}

	// Small numbers - no suffix
	return `${sign}${Math.round(absValue)}`;
}

/**
 * Strip trailing zeros from a decimal string
 * "2.0" -> "2", "2.50" -> "2.5", "2.75" -> "2.75"
 */
function stripTrailingZeros(value: string): string {
	if (!value.includes(".")) {
		return value;
	}
	return value.replace(/\.?0+$/, "");
}

/**
 * Format bytes for human-readable display
 *
 * @param bytes - The number of bytes
 * @returns Formatted string (e.g., "1.5 MB", "342 KB", "128 B")
 */
export function formatBytes(bytes: number): string {
	if (bytes === 0) {
		return "0 B";
	}

	const units = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	const value = bytes / 1024 ** i;

	// Use integer for bytes, 1 decimal for larger units
	if (i === 0) {
		return `${Math.round(value)} B`;
	}

	return `${stripTrailingZeros(value.toFixed(1))} ${units[i]}`;
}

/**
 * Format a duration in milliseconds for human-readable display
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "2.5s", "150ms", "1m 30s")
 */
export function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${Math.round(ms)}ms`;
	}

	if (ms < 60_000) {
		return `${stripTrailingZeros((ms / 1000).toFixed(1))}s`;
	}

	const minutes = Math.floor(ms / 60_000);
	const seconds = Math.round((ms % 60_000) / 1000);

	if (seconds === 0) {
		return `${minutes}m`;
	}

	return `${minutes}m ${seconds}s`;
}

/**
 * Format a percentage for display
 *
 * @param value - The percentage value (0-100)
 * @param options - Formatting options
 * @returns Formatted string (e.g., "85%", "99.5%")
 */
export function formatPercent(
	value: number,
	options: {
		/** Number of decimal places (default: 0) */
		decimals?: number;
	} = {},
): string {
	const { decimals = 0 } = options;
	const formatted = value.toFixed(decimals);
	return `${stripTrailingZeros(formatted)}%`;
}
