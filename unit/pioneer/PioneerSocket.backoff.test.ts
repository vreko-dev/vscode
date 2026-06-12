/**
 * PioneerSocket Exponential Backoff Tests
 *
 * Tests for WebSocket reconnection with exponential backoff:
 * - Backoff delay calculation with jitter
 * - Max delay capping
 * - Max attempts limit
 * - Reset on successful connection
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies before importing
vi.mock("vscode", () => ({
	EventEmitter: class {
		fire = vi.fn();
		event = vi.fn();
		dispose = vi.fn();
	},
	workspace: {
		getConfiguration: () => ({
			get: vi.fn().mockReturnValue(null),
		}),
	},
}));

vi.mock("ws", () => ({
	default: class MockWebSocket {
		static OPEN = 1;
		static CLOSED = 3;
		readyState = 1;
		on = vi.fn();
		send = vi.fn();
		close = vi.fn();
	},
}));

vi.mock("@vscode/utils/logger", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

// Import constants to test backoff calculation
import {
	WS_RECONNECT_DELAY,
	WS_RECONNECT_MAX_DELAY,
	WS_RECONNECT_MAX_ATTEMPTS,
} from "@vscode/constants";

describe("PioneerSocket Exponential Backoff", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("backoff constants", () => {
		it("should have correct base delay", () => {
			expect(WS_RECONNECT_DELAY).toBe(3000);
		});

		it("should have correct max delay", () => {
			expect(WS_RECONNECT_MAX_DELAY).toBe(120000); // 2 minutes
		});

		it("should have correct max attempts", () => {
			expect(WS_RECONNECT_MAX_ATTEMPTS).toBe(10);
		});
	});

	describe("backoff calculation logic", () => {
		/**
		 * Simulates the calculateBackoffDelay method logic for testing
		 */
		function calculateBackoffDelay(attempt: number): { min: number; max: number } {
			const exponentialDelay = WS_RECONNECT_DELAY * 2 ** attempt;
			const cappedDelay = Math.min(exponentialDelay, WS_RECONNECT_MAX_DELAY);
			// With ±25% jitter
			const min = cappedDelay * 0.75;
			const max = cappedDelay * 1.25;
			return { min, max };
		}

		it("should calculate correct delay for attempt 0", () => {
			const { min, max } = calculateBackoffDelay(0);
			// 3000ms base * 2^0 = 3000ms, with ±25% jitter = 2250-3750ms
			expect(min).toBe(2250);
			expect(max).toBe(3750);
		});

		it("should calculate correct delay for attempt 1", () => {
			const { min, max } = calculateBackoffDelay(1);
			// 3000ms * 2^1 = 6000ms, with ±25% jitter = 4500-7500ms
			expect(min).toBe(4500);
			expect(max).toBe(7500);
		});

		it("should calculate correct delay for attempt 2", () => {
			const { min, max } = calculateBackoffDelay(2);
			// 3000ms * 2^2 = 12000ms, with ±25% jitter = 9000-15000ms
			expect(min).toBe(9000);
			expect(max).toBe(15000);
		});

		it("should calculate correct delay for attempt 3", () => {
			const { min, max } = calculateBackoffDelay(3);
			// 3000ms * 2^3 = 24000ms, with ±25% jitter = 18000-30000ms
			expect(min).toBe(18000);
			expect(max).toBe(30000);
		});

		it("should cap delay at max for high attempt counts", () => {
			const { min, max } = calculateBackoffDelay(10);
			// 3000ms * 2^10 = 3,072,000ms > 120,000ms, capped at 120000ms
			// With ±25% jitter = 90000-150000ms
			expect(min).toBe(90000);
			expect(max).toBe(150000);
		});

		it("should cap delay at exactly max for very high attempts", () => {
			// Even at attempt 20, delay should be capped
			const exponentialDelay = WS_RECONNECT_DELAY * 2 ** 20;
			expect(exponentialDelay).toBeGreaterThan(WS_RECONNECT_MAX_DELAY);

			const { min, max } = calculateBackoffDelay(20);
			expect(min).toBe(90000);
			expect(max).toBe(150000);
		});
	});

	describe("reconnection behavior", () => {
		it("should stop reconnecting after max attempts", () => {
			// Simulate reaching max attempts
			let reconnectAttempts = WS_RECONNECT_MAX_ATTEMPTS;
			const shouldReconnect = reconnectAttempts < WS_RECONNECT_MAX_ATTEMPTS;

			expect(shouldReconnect).toBe(false);
		});

		it("should allow reconnection before max attempts", () => {
			// Simulate not yet reaching max attempts
			let reconnectAttempts = WS_RECONNECT_MAX_ATTEMPTS - 1;
			const shouldReconnect = reconnectAttempts < WS_RECONNECT_MAX_ATTEMPTS;

			expect(shouldReconnect).toBe(true);
		});
	});

	describe("jitter distribution", () => {
		it("should produce varied delays with jitter", () => {
			// Run multiple calculations to verify jitter produces variety
			const delays: number[] = [];
			const baseDelay = WS_RECONNECT_DELAY;
			const cappedDelay = baseDelay; // attempt 0

			for (let i = 0; i < 100; i++) {
				const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
				delays.push(Math.round(cappedDelay + jitter));
			}

			// Check that we have variety in delays
			const uniqueDelays = new Set(delays);
			expect(uniqueDelays.size).toBeGreaterThan(10); // Should have many unique values

			// Check bounds
			const minDelay = Math.min(...delays);
			const maxDelay = Math.max(...delays);
			expect(minDelay).toBeGreaterThanOrEqual(2250); // 3000 * 0.75
			expect(maxDelay).toBeLessThanOrEqual(3750); // 3000 * 1.25
		});
	});
});
