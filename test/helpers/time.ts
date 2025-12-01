/**
 * @fileoverview Fake Timers Helper
 *
 * Provides utilities for deterministic time-based testing using Vitest's
 * built-in fake timers. This ensures all tests are reproducible and not
 * subject to timing flakiness.
 *
 * Usage:
 * ```typescript
 * import { useDeterministicTime, advanceTime } from '@test/helpers/time';
 *
 * describe('My Test', () => {
 *   useDeterministicTime(); // Automatically sets up and tears down fake timers
 *
 *   it('waits for timeout', () => {
 *     const callback = vi.fn();
 *     setTimeout(callback, 1000);
 *
 *     advanceTime(1000);
 *     expect(callback).toHaveBeenCalled();
 *   });
 * });
 * ```
 */

import { afterEach, beforeEach, vi } from "vitest";

/**
 * Automatically sets up and tears down fake timers for a test suite
 *
 * @param options Configuration options
 * @param options.startTime Initial timestamp (default: 0)
 * @param options.shouldAdvanceTime Whether to advance time automatically (default: false)
 */
export function useDeterministicTime(
	options: { startTime?: number; shouldAdvanceTime?: boolean } = {},
) {
	const { startTime = 0, shouldAdvanceTime = false } = options;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(startTime);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	return {
		/**
		 * Advance timers by specified milliseconds
		 */
		advanceTime: (ms: number) => {
			if (shouldAdvanceTime) {
				vi.advanceTimersByTime(ms);
			}
		},
	};
}

/**
 * Advance all timers by the specified number of milliseconds
 *
 * @param ms Milliseconds to advance
 */
export function advanceTime(ms: number): void {
	vi.advanceTimersByTime(ms);
}

/**
 * Advance timers to the next timer
 */
export function advanceToNextTimer(): void {
	vi.advanceTimersToNextTimer();
}

/**
 * Run all pending timers
 */
export function runAllTimers(): void {
	vi.runAllTimers();
}

/**
 * Run only currently pending timers (not new ones created by those timers)
 */
export function runOnlyPendingTimers(): void {
	vi.runOnlyPendingTimers();
}

/**
 * Set the system time to a specific timestamp
 *
 * @param time Timestamp to set (milliseconds since epoch)
 */
export function setSystemTime(time: number | Date): void {
	vi.setSystemTime(time);
}

/**
 * Get the current mocked time
 *
 * @returns Current timestamp
 */
export function getCurrentTime(): number {
	return Date.now();
}

/**
 * Wait for a specific amount of time (using fake timers)
 *
 * @param ms Milliseconds to wait
 */
export async function waitForTime(ms: number): Promise<void> {
	const promise = new Promise<void>((resolve) => setTimeout(resolve, ms));
	vi.advanceTimersByTime(ms);
	return promise;
}

/**
 * Create a deterministic random number generator with a seed
 *
 * This is useful for tests that need randomness but must be reproducible.
 *
 * @param seed Seed for the RNG
 * @returns Function that returns deterministic random numbers
 */
export function createSeededRandom(seed: number): () => number {
	let state = seed;

	return function random(): number {
		// Simple LCG (Linear Congruential Generator)
		const a = 1664525;
		const c = 1013904223;
		const m = 2 ** 32;

		state = (a * state + c) % m;
		return state / m;
	};
}

/**
 * Mock Date.now() to return a deterministic value
 *
 * @param timestamp Timestamp to return
 */
export function mockDateNow(timestamp: number): void {
	vi.spyOn(Date, "now").mockReturnValue(timestamp);
}

/**
 * Mock performance.now() to return a deterministic value
 *
 * @param timestamp Timestamp to return
 */
export function mockPerformanceNow(timestamp: number): void {
	vi.spyOn(performance, "now").mockReturnValue(timestamp);
}

/**
 * Create a fake timer that can be controlled manually
 *
 * @returns Controller object for the fake timer
 */
export function createFakeTimer() {
	let currentTime = 0;
	const callbacks: Array<{ time: number; callback: () => void }> = [];

	return {
		/**
		 * Advance the timer by specified milliseconds
		 */
		advance(ms: number) {
			currentTime += ms;
			const toRun = callbacks.filter((cb) => cb.time <= currentTime);
			toRun.forEach((cb) => {
				cb.callback();
				const index = callbacks.indexOf(cb);
				if (index > -1) {
					callbacks.splice(index, 1);
				}
			});
		},

		/**
		 * Schedule a callback to run after specified delay
		 */
		setTimeout(callback: () => void, delay: number) {
			callbacks.push({ time: currentTime + delay, callback });
		},

		/**
		 * Get current time
		 */
		now(): number {
			return currentTime;
		},

		/**
		 * Reset the timer
		 */
		reset() {
			currentTime = 0;
			callbacks.length = 0;
		},
	};
}

/**
 * Measure execution time with fake timers
 *
 * @param fn Function to measure
 * @returns Object with duration and result
 */
export async function measureTime<T>(
	fn: () => T | Promise<T>,
): Promise<{ duration: number; result: T }> {
	const start = performance.now();
	const result = await fn();
	const duration = performance.now() - start;

	return { duration, result };
}

/**
 * Wait for a condition to be true (with timeout)
 *
 * @param condition Function that returns true when condition is met
 * @param timeout Maximum time to wait (ms)
 * @param interval How often to check (ms)
 */
export async function waitForCondition(
	condition: () => boolean,
	timeout: number = 5000,
	interval: number = 100,
): Promise<void> {
	const startTime = getCurrentTime();

	while (!condition()) {
		if (getCurrentTime() - startTime > timeout) {
			throw new Error(`Timeout waiting for condition after ${timeout}ms`);
		}
		await waitForTime(interval);
	}
}
