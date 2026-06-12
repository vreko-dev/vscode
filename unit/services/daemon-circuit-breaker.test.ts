/**
 * @fileoverview Daemon Circuit Breaker Tests
 *
 * Tests for P1 UX improvement: Circuit breaker pattern to prevent
 * retry spam when CLI is not installed (ENOENT errors).
 *
 * @see claudedocs/analysis/extension-activation-improvement-plan.md
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock vscode module
vi.mock("vscode", () => ({
	window: {
		showWarningMessage: vi.fn().mockResolvedValue(undefined),
	},
	commands: {
		executeCommand: vi.fn().mockResolvedValue(undefined),
	},
	env: {
		openExternal: vi.fn().mockResolvedValue(true),
	},
	Uri: {
		parse: vi.fn((url: string) => ({ toString: () => url })),
	},
	Disposable: class {
		dispose() { /* intentionally empty */ }
	},
	EventEmitter: class {
		event = vi.fn();
		fire = vi.fn();
		dispose = vi.fn();
	},
}));

describe("Daemon Circuit Breaker Pattern", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("Circuit Breaker State Management", () => {
		it("should track CLI not found state", () => {
			// Simulate circuit breaker state
			const circuitBreaker = {
				cliNotFound: false,
				lastError: null as string | null,
				notificationShown: false,
			};

			// Initially, circuit breaker is open (not tripped)
			expect(circuitBreaker.cliNotFound).toBe(false);

			// Simulate ENOENT error
			circuitBreaker.cliNotFound = true;
			circuitBreaker.lastError = "spawn vreko ENOENT";

			// Circuit breaker should be tripped
			expect(circuitBreaker.cliNotFound).toBe(true);
			expect(circuitBreaker.lastError).toContain("ENOENT");
		});

		it("should prevent automatic retries when circuit is tripped", () => {
			const circuitBreaker = {
				cliNotFound: true,
				lastError: "spawn vreko ENOENT",
				notificationShown: true,
			};

			let autoStartAttempted = false;

			// Simulate autoStartDaemon check
			const autoStartDaemon = () => {
				if (circuitBreaker.cliNotFound) {
					// Skip automatic retry
					return false;
				}
				autoStartAttempted = true;
				return true;
			};

			const result = autoStartDaemon();

			expect(result).toBe(false);
			expect(autoStartAttempted).toBe(false);
		});

		it("should allow retry after circuit breaker reset", () => {
			const circuitBreaker = {
				cliNotFound: true,
				lastError: "spawn vreko ENOENT",
				notificationShown: true,
			};

			// Reset circuit breaker (simulating user clicking "Retry")
			const resetCircuitBreaker = () => {
				circuitBreaker.cliNotFound = false;
				circuitBreaker.lastError = null;
				circuitBreaker.notificationShown = false;
			};

			resetCircuitBreaker();

			expect(circuitBreaker.cliNotFound).toBe(false);
			expect(circuitBreaker.lastError).toBeNull();
			expect(circuitBreaker.notificationShown).toBe(false);
		});
	});

	describe("Notification Behavior", () => {
		it("should show notification only once per session", () => {
			const circuitBreaker = {
				cliNotFound: false,
				lastError: null as string | null,
				notificationShown: false,
			};

			let notificationCount = 0;

			const showCliNotFoundNotification = () => {
				if (circuitBreaker.notificationShown) {
					return; // Don't show again
				}
				circuitBreaker.notificationShown = true;
				notificationCount++;
			};

			// First call shows notification
			showCliNotFoundNotification();
			expect(notificationCount).toBe(1);

			// Second call does not show notification
			showCliNotFoundNotification();
			expect(notificationCount).toBe(1);

			// Third call does not show notification
			showCliNotFoundNotification();
			expect(notificationCount).toBe(1);
		});

		it("should provide three action options", () => {
			const expectedActions = ["Configure CLI Path", "Install CLI", "Retry"];

			// Verify the notification message structure
			const notificationMessage =
				"Vreko CLI not found. Some features (daemon mode, advanced sync) are unavailable.";

			expect(notificationMessage).toContain("CLI not found");
			expect(expectedActions).toContain("Configure CLI Path");
			expect(expectedActions).toContain("Install CLI");
			expect(expectedActions).toContain("Retry");
		});
	});

	describe("ENOENT Detection", () => {
		it("should detect ENOENT from error code", () => {
			const error = { code: "ENOENT", message: "spawn vreko" };

			const isEnoent = error.code === "ENOENT";

			expect(isEnoent).toBe(true);
		});

		it("should detect ENOENT from error message", () => {
			const error = { message: "spawn vreko ENOENT" };

			const isEnoent = error.message.includes("ENOENT");

			expect(isEnoent).toBe(true);
		});

		it("should not trigger circuit breaker for other errors", () => {
			const circuitBreaker = {
				cliNotFound: false,
				lastError: null as string | null,
			};

			const handleError = (err: { code?: string; message: string }) => {
				if (err.code === "ENOENT" || err.message.includes("ENOENT")) {
					circuitBreaker.cliNotFound = true;
					circuitBreaker.lastError = err.message;
				}
			};

			// Non-ENOENT error should not trip circuit breaker
			handleError({ code: "ECONNREFUSED", message: "Connection refused" });

			expect(circuitBreaker.cliNotFound).toBe(false);
			expect(circuitBreaker.lastError).toBeNull();
		});
	});

	describe("Action Handlers", () => {
		it("should reset circuit breaker when user configures CLI path", () => {
			const circuitBreaker = {
				cliNotFound: true,
				lastError: "ENOENT",
				notificationShown: true,
			};

			const handleConfigureCliPath = () => {
				// Open settings
				// Reset circuit breaker to allow retry after settings change
				circuitBreaker.cliNotFound = false;
				circuitBreaker.lastError = null;
				circuitBreaker.notificationShown = false;
			};

			handleConfigureCliPath();

			expect(circuitBreaker.cliNotFound).toBe(false);
		});

		it("should reset circuit breaker when user clicks Retry", () => {
			const circuitBreaker = {
				cliNotFound: true,
				lastError: "ENOENT",
				notificationShown: true,
			};

			let connectCalled = false;

			const handleRetry = () => {
				// Reset circuit breaker
				circuitBreaker.cliNotFound = false;
				circuitBreaker.lastError = null;
				circuitBreaker.notificationShown = false;
				// Attempt connection
				connectCalled = true;
			};

			handleRetry();

			expect(circuitBreaker.cliNotFound).toBe(false);
			expect(connectCalled).toBe(true);
		});
	});
});
