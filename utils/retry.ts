/**
 * Local retry utilities for VSCode extension
 * Implements exponential backoff to avoid @vreko/sdk dependency
 */

/**
 * Calculate exponential backoff delay with optional jitter
 * @param attempt - The current retry attempt (0-indexed)
 * @param baseMs - Base delay in milliseconds (default: 100)
 * @param maxMs - Maximum delay cap in milliseconds (default: 30000)
 * @param withJitter - Whether to add random jitter (default: true)
 */
export function calculateBackoff(attempt: number, baseMs = 100, maxMs = 30000, withJitter = true): number {
	const delay = Math.min(baseMs * 2 ** attempt, maxMs);
	if (!withJitter) {
		return Math.round(delay);
	}
	// Add jitter (±10%)
	const jitter = delay * 0.1 * (Math.random() * 2 - 1);
	return Math.round(delay + jitter);
}

export interface RetryOptions {
	maxAttempts?: number;
	baseDelayMs?: number;
	maxDelayMs?: number;
	shouldRetry?: (error: Error) => boolean;
	onRetry?: (attempt: number, error: unknown) => void;
}

export const RetryPresets = {
	default: { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 5000 },
	aggressive: { maxAttempts: 5, baseDelayMs: 50, maxDelayMs: 10000 },
	conservative: { maxAttempts: 2, baseDelayMs: 500, maxDelayMs: 30000 },
	network: { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 10000 },
} as const;

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
	const { maxAttempts = 3, baseDelayMs = 100, maxDelayMs = 5000, shouldRetry, onRetry } = options;

	let lastError: Error | undefined;

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			if (shouldRetry && !shouldRetry(lastError)) {
				throw lastError;
			}

			if (attempt < maxAttempts - 1) {
				onRetry?.(attempt, error);
				const delay = calculateBackoff(attempt, baseDelayMs, maxDelayMs);
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
	}

	throw lastError;
}
