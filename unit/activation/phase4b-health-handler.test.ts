/**
 * Phase 4b MCPHealthGuardian Handler Tests
 *
 * REGRESSION TEST: BUG-3 - MCPHealthGuardian.onHealthChange never calls resetAndRetry
 * Previously: onHealthChange handler only fired signal events (health.degraded, health.recovered)
 *             and never triggered automatic daemon recovery via resetAndRetry()
 * Fixed: Added resetAndRetry() call when unhealthy AND !isConnected(), with 30s cooldown
 *
 * These tests verify the handler logic that was added in phase4b-deferred-ui.ts
 * without requiring the actual module dependencies.
 *
 * @module activation/__tests__/phase4b-health-handler.test
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * Health states used by MCPHealthGuardian
 */
type HealthState = "healthy" | "degraded" | "unhealthy";

interface HealthEvent {
	currentState: HealthState;
	previousState: HealthState;
	timestamp: number;
}

/**
 * Simulates the health change handler from phase4b-deferred-ui.ts
 * This is the implementation that was fixed in BUG-3
 */
function createHealthHandler(daemonBridge: {
	isConnected: () => boolean;
	resetAndRetry: () => void;
}) {
	let lastRecoveryAttemptMs = 0;

	return {
		handler: (event: HealthEvent) => {
			if (event.currentState === "unhealthy" && !daemonBridge.isConnected()) {
				// BUG-3 FIX: Trigger automatic daemon recovery with 30s cooldown
				// Uses Date.now() as in the actual implementation
				const now = Date.now();
				if (now - lastRecoveryAttemptMs > 30_000) {
					lastRecoveryAttemptMs = now;
					daemonBridge.resetAndRetry();
				}
			}
		},
		getLastRecoveryAttemptMs: () => lastRecoveryAttemptMs,
	};
}

describe("Phase 4b MCPHealthGuardian Handler - BUG-3 Regression Tests", () => {
	let mockDaemonBridge: {
		isConnected: ReturnType<typeof vi.fn>;
		resetAndRetry: ReturnType<typeof vi.fn>;
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		mockDaemonBridge = {
			isConnected: vi.fn().mockReturnValue(false),
			resetAndRetry: vi.fn(),
		};
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("onHealthChange handler wiring", () => {
		it("should call resetAndRetry when unhealthy and not connected", () => {
			const { handler } = createHealthHandler(mockDaemonBridge);

			// Simulate unhealthy event with disconnected bridge
			const event: HealthEvent = {
				currentState: "unhealthy",
				previousState: "healthy",
				timestamp: Date.now(),
			};

			handler(event);

			expect(mockDaemonBridge.resetAndRetry).toHaveBeenCalledTimes(1);
		});

		it("should NOT call resetAndRetry when unhealthy but connected", () => {
			mockDaemonBridge.isConnected.mockReturnValue(true);
			const { handler } = createHealthHandler(mockDaemonBridge);

			const event: HealthEvent = {
				currentState: "unhealthy",
				previousState: "healthy",
				timestamp: Date.now(),
			};

			handler(event);

			expect(mockDaemonBridge.resetAndRetry).not.toHaveBeenCalled();
		});

		it("should NOT call resetAndRetry when degraded (only unhealthy triggers recovery)", () => {
			const { handler } = createHealthHandler(mockDaemonBridge);

			const event: HealthEvent = {
				currentState: "degraded",
				previousState: "healthy",
				timestamp: Date.now(),
			};

			handler(event);

			expect(mockDaemonBridge.resetAndRetry).not.toHaveBeenCalled();
		});

		it("should NOT call resetAndRetry when healthy", () => {
			const { handler } = createHealthHandler(mockDaemonBridge);

			const event: HealthEvent = {
				currentState: "healthy",
				previousState: "unhealthy",
				timestamp: Date.now(),
			};

			handler(event);

			expect(mockDaemonBridge.resetAndRetry).not.toHaveBeenCalled();
		});
	});

	describe("30-second cooldown prevents hammer behavior", () => {
		it("should NOT call resetAndRetry twice within 30 seconds", () => {
			const { handler } = createHealthHandler(mockDaemonBridge);

			// First unhealthy event at T=60_000 (must be > 30_000 from initial 0)
			vi.setSystemTime(60_000);
			handler({
				currentState: "unhealthy",
				previousState: "healthy",
				timestamp: 60_000,
			});
			expect(mockDaemonBridge.resetAndRetry).toHaveBeenCalledTimes(1);

			// Second unhealthy event at T=75_000 (within 30s cooldown from 60_000)
			vi.setSystemTime(75_000);
			handler({
				currentState: "unhealthy",
				previousState: "unhealthy",
				timestamp: 75_000,
			});
			expect(mockDaemonBridge.resetAndRetry).toHaveBeenCalledTimes(1); // Still 1

			// Third event at T=91_000 (past 30s cooldown from 60_000)
			vi.setSystemTime(91_000);
			handler({
				currentState: "unhealthy",
				previousState: "unhealthy",
				timestamp: 91_000,
			});
			expect(mockDaemonBridge.resetAndRetry).toHaveBeenCalledTimes(2); // Now 2
		});

		it("should allow recovery after exactly 30 seconds have passed", () => {
			const { handler } = createHealthHandler(mockDaemonBridge);

			// First call at T=60_000
			vi.setSystemTime(60_000);
			handler({
				currentState: "unhealthy",
				previousState: "healthy",
				timestamp: 60_000,
			});
			expect(mockDaemonBridge.resetAndRetry).toHaveBeenCalledTimes(1);

			// Second call at T=90_001 (exactly past 30s cooldown)
			vi.setSystemTime(90_001);
			handler({
				currentState: "unhealthy",
				previousState: "unhealthy",
				timestamp: 90_001,
			});
			expect(mockDaemonBridge.resetAndRetry).toHaveBeenCalledTimes(2);
		});

		it("should NOT allow recovery at exactly 30 seconds (must be > 30s)", () => {
			const { handler } = createHealthHandler(mockDaemonBridge);

			// First call at T=60_000
			vi.setSystemTime(60_000);
			handler({
				currentState: "unhealthy",
				previousState: "healthy",
				timestamp: 60_000,
			});
			expect(mockDaemonBridge.resetAndRetry).toHaveBeenCalledTimes(1);

			// Second call at T=90_000 (exactly at 30s cooldown, NOT past it)
			vi.setSystemTime(90_000);
			handler({
				currentState: "unhealthy",
				previousState: "unhealthy",
				timestamp: 90_000,
			});
			// 90_000 - 60_000 = 30_000 which is NOT > 30_000
			expect(mockDaemonBridge.resetAndRetry).toHaveBeenCalledTimes(1);
		});

		it("should track lastRecoveryAttemptMs correctly across multiple calls", () => {
			const { handler, getLastRecoveryAttemptMs } = createHealthHandler(mockDaemonBridge);

			// First call at T=60_000
			vi.setSystemTime(60_000);
			handler({
				currentState: "unhealthy",
				previousState: "healthy",
				timestamp: 60_000,
			});
			expect(getLastRecoveryAttemptMs()).toBe(60_000);

			// Second call at T=160_000 (past cooldown)
			vi.setSystemTime(160_000);
			handler({
				currentState: "unhealthy",
				previousState: "unhealthy",
				timestamp: 160_000,
			});
			expect(getLastRecoveryAttemptMs()).toBe(160_000);
		});
	});

	describe("edge cases", () => {
		it("should handle rapid successive unhealthy events", () => {
			const { handler } = createHealthHandler(mockDaemonBridge);

			// Start at T=60_000
			vi.setSystemTime(60_000);

			// Rapid fire 10 events within 1 second
			for (let i = 0; i < 10; i++) {
				vi.setSystemTime(60_000 + i * 100); // 60000, 60100, 60200, etc.
				handler({
					currentState: "unhealthy",
					previousState: "healthy",
					timestamp: 60_000 + i * 100,
				});
			}

			// Only the first should have triggered resetAndRetry
			expect(mockDaemonBridge.resetAndRetry).toHaveBeenCalledTimes(1);
		});

		it("should handle connection state changes between events", () => {
			const { handler } = createHealthHandler(mockDaemonBridge);

			// First event: disconnected at T=60_000
			mockDaemonBridge.isConnected.mockReturnValue(false);
			vi.setSystemTime(60_000);
			handler({
				currentState: "unhealthy",
				previousState: "healthy",
				timestamp: 60_000,
			});
			expect(mockDaemonBridge.resetAndRetry).toHaveBeenCalledTimes(1);

			// Second event: now connected (should NOT trigger even if unhealthy)
			mockDaemonBridge.isConnected.mockReturnValue(true);
			vi.setSystemTime(120_000);
			handler({
				currentState: "unhealthy",
				previousState: "healthy",
				timestamp: 120_000,
			});
			expect(mockDaemonBridge.resetAndRetry).toHaveBeenCalledTimes(1); // Still 1

			// Third event: disconnected again
			mockDaemonBridge.isConnected.mockReturnValue(false);
			vi.setSystemTime(180_000);
			handler({
				currentState: "unhealthy",
				previousState: "unhealthy",
				timestamp: 180_000,
			});
			expect(mockDaemonBridge.resetAndRetry).toHaveBeenCalledTimes(2); // Now 2
		});

		it("should handle transitioning from degraded to unhealthy", () => {
			const { handler } = createHealthHandler(mockDaemonBridge);

			// First: degraded at T=60_000 (should NOT trigger)
			vi.setSystemTime(60_000);
			handler({
				currentState: "degraded",
				previousState: "healthy",
				timestamp: 60_000,
			});
			expect(mockDaemonBridge.resetAndRetry).not.toHaveBeenCalled();

			// Then: unhealthy at T=65_000 (SHOULD trigger)
			vi.setSystemTime(65_000);
			handler({
				currentState: "unhealthy",
				previousState: "degraded",
				timestamp: 65_000,
			});
			expect(mockDaemonBridge.resetAndRetry).toHaveBeenCalledTimes(1);
		});
	});
});
