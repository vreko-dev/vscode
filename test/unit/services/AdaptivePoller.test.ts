/**
 * AdaptivePoller Tests
 *
 * TDD tests for intelligent polling with dynamic intervals.
 * Tests cover:
 * - Lifecycle management (start, stop, pause, resume)
 * - Mode switching and interval calculation
 * - Poll request emission
 * - Deep check scheduling
 * - Watchdog detection
 * - Configuration updates
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
	AdaptivePoller,
	type PollingMode,
	type PollRequest,
	type AdaptivePollerConfig,
} from "../../../src/services/AdaptivePoller";

// Mock VS Code
vi.mock("vscode", () => ({
	EventEmitter: class MockEventEmitter<T> {
		private listeners: Array<(e: T) => void> = [];
		event = (listener: (e: T) => void) => {
			this.listeners.push(listener);
			return { dispose: () => this.listeners.splice(this.listeners.indexOf(listener), 1) };
		};
		fire = (data: T) => {
			this.listeners.forEach((l) => l(data));
		};
		dispose = () => {
			this.listeners = [];
		};
	},
}));

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

describe("AdaptivePoller", () => {
	let poller: AdaptivePoller;
	const fastConfig: Partial<AdaptivePollerConfig> = {
		activeInterval: 50,
		idleInterval: 100,
		backgroundInterval: 200,
		recoveringInterval: 25,
		deepCheckFrequency: 3,
		watchdogInterval: 500,
	};

	beforeEach(() => {
		vi.useFakeTimers();
		poller = new AdaptivePoller(fastConfig);
	});

	afterEach(() => {
		poller.dispose();
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	// =========================================================================
	// LIFECYCLE TESTS
	// =========================================================================

	describe("Lifecycle", () => {
		it("should start polling", () => {
			const stats = poller.getStats();
			expect(stats.isRunning).toBe(false);

			poller.start();

			const statsAfter = poller.getStats();
			expect(statsAfter.isRunning).toBe(true);
		});

		it("should not start twice", () => {
			poller.start();
			const firstStats = poller.getStats();

			poller.start(); // Second call should be no-op
			const secondStats = poller.getStats();

			expect(firstStats.pollCount).toBe(secondStats.pollCount);
		});

		it("should stop polling", () => {
			poller.start();
			expect(poller.getStats().isRunning).toBe(true);

			poller.stop();
			expect(poller.getStats().isRunning).toBe(false);
		});

		it("should pause polling", () => {
			poller.start();
			expect(poller.getStats().isPaused).toBe(false);

			poller.pause();
			expect(poller.getStats().isPaused).toBe(true);
			expect(poller.getStats().isRunning).toBe(false);
		});

		it("should resume polling after pause", () => {
			poller.start();
			poller.pause();
			expect(poller.getStats().isPaused).toBe(true);

			poller.resume();
			expect(poller.getStats().isPaused).toBe(false);
			expect(poller.getStats().isRunning).toBe(true);
		});

		it("should not resume if not paused", () => {
			poller.start();
			const pollRequests: PollRequest[] = [];
			poller.onPollRequest((req) => pollRequests.push(req));

			poller.resume(); // Should be no-op since not paused

			// Should still be running normally
			expect(poller.getStats().isRunning).toBe(true);
		});

		it("should dispose cleanly", () => {
			poller.start();
			poller.dispose();

			expect(poller.getStats().isRunning).toBe(false);
		});
	});

	// =========================================================================
	// MODE SWITCHING TESTS
	// =========================================================================

	describe("Mode Switching", () => {
		it("should default to idle mode", () => {
			expect(poller.getMode()).toBe("idle");
		});

		it("should change mode", () => {
			poller.setMode("active");
			expect(poller.getMode()).toBe("active");

			poller.setMode("background");
			expect(poller.getMode()).toBe("background");

			poller.setMode("recovering");
			expect(poller.getMode()).toBe("recovering");
		});

		it("should not reschedule if mode is same", () => {
			poller.start();
			const pollRequests: PollRequest[] = [];
			poller.onPollRequest((req) => pollRequests.push(req));

			poller.setMode("idle"); // Already idle

			// Advance time to first poll
			vi.advanceTimersByTime(100);
			expect(pollRequests.length).toBe(1);
		});

		it("should reschedule with new interval when mode changes", () => {
			poller.start();
			const pollRequests: PollRequest[] = [];
			poller.onPollRequest((req) => pollRequests.push(req));

			// Start in idle mode (100ms)
			vi.advanceTimersByTime(50);
			expect(pollRequests.length).toBe(0);

			// Switch to active mode (50ms)
			poller.setMode("active");

			// Poll should happen sooner now
			vi.advanceTimersByTime(50);
			expect(pollRequests.length).toBe(1);
			expect(pollRequests[0].mode).toBe("active");
		});

		it("should return correct interval for each mode", () => {
			poller.setMode("active");
			expect(poller.getCurrentInterval()).toBe(50);

			poller.setMode("idle");
			expect(poller.getCurrentInterval()).toBe(100);

			poller.setMode("background");
			expect(poller.getCurrentInterval()).toBe(200);

			poller.setMode("recovering");
			expect(poller.getCurrentInterval()).toBe(25);
		});
	});

	// =========================================================================
	// POLL REQUEST EMISSION TESTS
	// =========================================================================

	describe("Poll Request Emission", () => {
		it("should emit poll requests at configured intervals", () => {
			const pollRequests: PollRequest[] = [];
			poller.onPollRequest((req) => pollRequests.push(req));
			poller.start();

			// Idle mode = 100ms
			vi.advanceTimersByTime(100);
			expect(pollRequests.length).toBe(1);

			vi.advanceTimersByTime(100);
			expect(pollRequests.length).toBe(2);

			vi.advanceTimersByTime(100);
			expect(pollRequests.length).toBe(3);
		});

		it("should include correct poll request data", () => {
			const pollRequests: PollRequest[] = [];
			poller.onPollRequest((req) => pollRequests.push(req));
			poller.setMode("active");
			poller.start();

			vi.advanceTimersByTime(50);

			expect(pollRequests[0]).toMatchObject({
				type: "shallow",
				mode: "active",
				pollNumber: 1,
			});
			expect(pollRequests[0].timestamp).toBeGreaterThan(0);
		});

		it("should increment poll number", () => {
			const pollRequests: PollRequest[] = [];
			poller.onPollRequest((req) => pollRequests.push(req));
			poller.start();

			vi.advanceTimersByTime(300); // 3 polls at 100ms

			expect(pollRequests[0].pollNumber).toBe(1);
			expect(pollRequests[1].pollNumber).toBe(2);
			expect(pollRequests[2].pollNumber).toBe(3);
		});

		it("should not emit when paused", () => {
			const pollRequests: PollRequest[] = [];
			poller.onPollRequest((req) => pollRequests.push(req));
			poller.start();

			vi.advanceTimersByTime(100);
			expect(pollRequests.length).toBe(1);

			poller.pause();
			vi.advanceTimersByTime(300);
			expect(pollRequests.length).toBe(1); // Still 1
		});

		it("should trigger immediate poll", () => {
			const pollRequests: PollRequest[] = [];
			poller.onPollRequest((req) => pollRequests.push(req));
			poller.start();

			poller.triggerImmediate();
			expect(pollRequests.length).toBe(1);

			poller.triggerImmediate("deep");
			expect(pollRequests.length).toBe(2);
			expect(pollRequests[1].type).toBe("deep");
		});
	});

	// =========================================================================
	// DEEP CHECK SCHEDULING TESTS
	// =========================================================================

	describe("Deep Check Scheduling", () => {
		it("should schedule deep check every Nth poll", () => {
			const pollRequests: PollRequest[] = [];
			poller.onPollRequest((req) => pollRequests.push(req));
			poller.start();

			// deepCheckFrequency = 3, so polls 3, 6, 9... should be deep
			vi.advanceTimersByTime(600); // 6 polls at 100ms

			expect(pollRequests[0].type).toBe("shallow"); // Poll 1
			expect(pollRequests[1].type).toBe("shallow"); // Poll 2
			expect(pollRequests[2].type).toBe("deep"); // Poll 3
			expect(pollRequests[3].type).toBe("shallow"); // Poll 4
			expect(pollRequests[4].type).toBe("shallow"); // Poll 5
			expect(pollRequests[5].type).toBe("deep"); // Poll 6
		});

		it("should force deep check on next poll", () => {
			const pollRequests: PollRequest[] = [];
			poller.onPollRequest((req) => pollRequests.push(req));
			poller.start();

			vi.advanceTimersByTime(100); // Poll 1 - shallow
			expect(pollRequests[0].type).toBe("shallow");

			poller.forceDeepCheck();
			vi.advanceTimersByTime(100); // Poll 2 - forced deep
			expect(pollRequests[1].type).toBe("deep");

			vi.advanceTimersByTime(100); // Poll 3 - deep (normal schedule)
			expect(pollRequests[2].type).toBe("deep"); // Every 3rd is deep anyway
		});

		it("should clear force deep flag after use", () => {
			const pollRequests: PollRequest[] = [];
			poller.onPollRequest((req) => pollRequests.push(req));
			poller.start();

			poller.forceDeepCheck();
			vi.advanceTimersByTime(100); // Forced deep
			expect(pollRequests[0].type).toBe("deep");

			vi.advanceTimersByTime(100); // Should be shallow (poll 2)
			expect(pollRequests[1].type).toBe("shallow");
		});

		it("should always use deep check in recovering mode", () => {
			const pollRequests: PollRequest[] = [];
			poller.onPollRequest((req) => pollRequests.push(req));
			poller.setMode("recovering");
			poller.start();

			vi.advanceTimersByTime(75); // 3 polls at 25ms

			expect(pollRequests[0].type).toBe("deep");
			expect(pollRequests[1].type).toBe("deep");
			expect(pollRequests[2].type).toBe("deep");
		});
	});

	// =========================================================================
	// WATCHDOG TESTS
	// =========================================================================

	describe("Watchdog", () => {
		it("should detect stuck polling", async () => {
			const pollRequests: PollRequest[] = [];
			poller.onPollRequest((req) => pollRequests.push(req));
			poller.start();

			// First poll at 100ms
			vi.advanceTimersByTime(100);
			expect(pollRequests.length).toBe(1);

			// Simulate stuck by advancing past watchdog threshold
			// Expected interval is 100ms, so 2x = 200ms threshold
			// Watchdog runs at 500ms intervals
			vi.advanceTimersByTime(500);

			// Watchdog should have detected stuck and triggered a poll
			expect(pollRequests.length).toBeGreaterThan(1);
		});

		it("should not trigger watchdog when paused", () => {
			const pollRequests: PollRequest[] = [];
			poller.onPollRequest((req) => pollRequests.push(req));
			poller.start();

			vi.advanceTimersByTime(100);
			expect(pollRequests.length).toBe(1);

			poller.pause();

			// Advance past watchdog interval
			vi.advanceTimersByTime(1000);

			// Should still be 1 poll (watchdog ignores paused state)
			expect(pollRequests.length).toBe(1);
		});
	});

	// =========================================================================
	// STATISTICS TESTS
	// =========================================================================

	describe("Statistics", () => {
		it("should track poll count", () => {
			poller.start();

			expect(poller.getStats().pollCount).toBe(0);

			vi.advanceTimersByTime(300); // 3 polls
			expect(poller.getStats().pollCount).toBe(3);
		});

		it("should track last poll time", () => {
			poller.start();

			expect(poller.getStats().lastPollTime).toBe(0);

			vi.advanceTimersByTime(100);
			const stats = poller.getStats();
			expect(stats.lastPollTime).toBeGreaterThan(0);
		});

		it("should report correct running state", () => {
			expect(poller.getStats().isRunning).toBe(false);

			poller.start();
			expect(poller.getStats().isRunning).toBe(true);

			poller.pause();
			expect(poller.getStats().isRunning).toBe(false);

			poller.resume();
			expect(poller.getStats().isRunning).toBe(true);

			poller.stop();
			expect(poller.getStats().isRunning).toBe(false);
		});

		it("should report current interval", () => {
			expect(poller.getStats().currentInterval).toBe(100); // idle

			poller.setMode("active");
			expect(poller.getStats().currentInterval).toBe(50);

			poller.setMode("background");
			expect(poller.getStats().currentInterval).toBe(200);
		});
	});

	// =========================================================================
	// CONFIGURATION TESTS
	// =========================================================================

	describe("Configuration", () => {
		it("should use default config values", () => {
			const defaultPoller = new AdaptivePoller();
			defaultPoller.setMode("active");
			expect(defaultPoller.getCurrentInterval()).toBe(3000);
			defaultPoller.dispose();
		});

		it("should merge partial config with defaults", () => {
			const partialPoller = new AdaptivePoller({ activeInterval: 1000 });
			partialPoller.setMode("active");
			expect(partialPoller.getCurrentInterval()).toBe(1000);
			partialPoller.setMode("idle");
			expect(partialPoller.getCurrentInterval()).toBe(10000); // default
			partialPoller.dispose();
		});

		it("should update config dynamically", () => {
			poller.setMode("active");
			expect(poller.getCurrentInterval()).toBe(50);

			poller.updateConfig({ activeInterval: 75 });
			expect(poller.getCurrentInterval()).toBe(75);
		});

		it("should reschedule on config update while running", () => {
			const pollRequests: PollRequest[] = [];
			poller.onPollRequest((req) => pollRequests.push(req));
			poller.start();

			// Idle mode, 100ms interval
			vi.advanceTimersByTime(50); // Halfway
			expect(pollRequests.length).toBe(0);

			// Update to shorter interval
			poller.updateConfig({ idleInterval: 30 });

			// Should poll after new shorter interval
			vi.advanceTimersByTime(30);
			expect(pollRequests.length).toBe(1);
		});
	});

	// =========================================================================
	// EDGE CASES
	// =========================================================================

	describe("Edge Cases", () => {
		it("should handle rapid mode changes", () => {
			const pollRequests: PollRequest[] = [];
			poller.onPollRequest((req) => pollRequests.push(req));
			poller.start();

			// Rapidly switch modes
			poller.setMode("active");
			poller.setMode("background");
			poller.setMode("recovering");
			poller.setMode("idle");

			// Should still poll normally
			vi.advanceTimersByTime(100);
			expect(pollRequests.length).toBe(1);
			expect(pollRequests[0].mode).toBe("idle");
		});

		it("should handle multiple pause/resume cycles", () => {
			const pollRequests: PollRequest[] = [];
			poller.onPollRequest((req) => pollRequests.push(req));
			poller.start();

			vi.advanceTimersByTime(100);
			expect(pollRequests.length).toBe(1);

			// First cycle
			poller.pause();
			vi.advanceTimersByTime(100);
			poller.resume();
			vi.advanceTimersByTime(100);
			expect(pollRequests.length).toBe(2);

			// Second cycle
			poller.pause();
			vi.advanceTimersByTime(200);
			poller.resume();
			vi.advanceTimersByTime(100);
			expect(pollRequests.length).toBe(3);
		});

		it("should handle stop while paused", () => {
			poller.start();
			poller.pause();
			poller.stop();

			expect(poller.getStats().isRunning).toBe(false);
			expect(poller.getStats().isPaused).toBe(true); // Still marked as paused
		});

		it("should handle multiple listeners", () => {
			const requests1: PollRequest[] = [];
			const requests2: PollRequest[] = [];

			poller.onPollRequest((req) => requests1.push(req));
			poller.onPollRequest((req) => requests2.push(req));
			poller.start();

			vi.advanceTimersByTime(100);

			expect(requests1.length).toBe(1);
			expect(requests2.length).toBe(1);
		});

		it("should handle listener disposal", () => {
			const requests1: PollRequest[] = [];
			const requests2: PollRequest[] = [];

			const sub1 = poller.onPollRequest((req) => requests1.push(req));
			poller.onPollRequest((req) => requests2.push(req));
			poller.start();

			vi.advanceTimersByTime(100);
			expect(requests1.length).toBe(1);
			expect(requests2.length).toBe(1);

			// Dispose first listener
			sub1.dispose();

			vi.advanceTimersByTime(100);
			expect(requests1.length).toBe(1); // Still 1
			expect(requests2.length).toBe(2); // Incremented
		});
	});
});
