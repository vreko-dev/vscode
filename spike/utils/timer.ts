/**
 * Performance measurement utilities for spike validation
 */

export async function timer<T>(
	fn: () => Promise<T>,
): Promise<{ elapsed: number; result: T }> {
	const start = performance.now();
	const result = await fn();
	const elapsed = Math.round(performance.now() - start);
	return { elapsed, result };
}

export async function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
): Promise<T> {
	return Promise.race([
		promise,
		new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms),
		),
	]);
}
