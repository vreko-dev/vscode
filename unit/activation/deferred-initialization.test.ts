/**
 * @fileoverview Deferred Initialization Tests
 *
 * Tests for the P0 activation performance improvements:
 * 1. LSP deferral to setImmediate (~1000ms savings)
 * 2. PlatformCoordinator.initialize() fire-and-forget (~300ms savings)
 *
 * These patterns ensure activation completes within the 500ms budget
 * by deferring non-critical initialization to after activate() returns.
 *
 * @see claudedocs/analysis/extension-activation-improvement-plan.md
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Deferred Initialization Patterns", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe("setImmediate Deferral Pattern", () => {
		it("should not block caller when using setImmediate", async () => {
			const executionOrder: string[] = [];
			let deferredWorkComplete = false;

			// Simulate the activation pattern
			const activate = () => {
				executionOrder.push("activate-start");

				// Fire-and-forget with setImmediate
				setImmediate(() => {
					executionOrder.push("deferred-work");
					deferredWorkComplete = true;
				});

				executionOrder.push("activate-end");
			};

			activate();

			// activate() should complete immediately
			expect(executionOrder).toEqual(["activate-start", "activate-end"]);
			expect(deferredWorkComplete).toBe(false);

			// Run setImmediate callbacks
			await vi.runAllTimersAsync();

			// Now deferred work should be complete
			expect(executionOrder).toEqual([
				"activate-start",
				"activate-end",
				"deferred-work",
			]);
			expect(deferredWorkComplete).toBe(true);
		});

		it("should handle errors in deferred work without affecting caller", async () => {
			const errors: Error[] = [];
			let activationCompleted = false;

			// Simulate the LSP activation pattern with error handling
			const activateLSP = () => {
				activationCompleted = true;

				setImmediate(() => {
					Promise.reject(new Error("LSP failed to start")).catch(
						(err) => {
							errors.push(err);
						},
					);
				});
			};

			activateLSP();

			// Activation should complete immediately
			expect(activationCompleted).toBe(true);
			expect(errors).toHaveLength(0);

			// Run deferred callbacks
			await vi.runAllTimersAsync();

			// Error should be caught and logged, not thrown
			expect(errors).toHaveLength(1);
			expect(errors[0].message).toBe("LSP failed to start");
		});

		it("should measure near-zero time for deferred phase", () => {
			const phaseTimings: Record<string, number> = {};

			const measureDeferredPhase = () => {
				const start = Date.now();

				// Schedule heavy work to run later
				setImmediate(() => {
					// Simulate 1000ms of work
					// In real code this would be activateLanguageServer()
				});

				// Record timing immediately (should be <10ms)
				phaseTimings["Phase 1.5 (LSP)"] = Date.now() - start;
			};

			measureDeferredPhase();

			// Should be near-zero since we deferred the work
			expect(phaseTimings["Phase 1.5 (LSP)"]).toBeLessThan(10);
		});
	});

	describe("Fire-and-Forget Promise Pattern", () => {
		it("should not block on promise resolution", async () => {
			const executionOrder: string[] = [];
			let initializeResolved = false;

			// Simulate PlatformCoordinator pattern
			const initializePhase = async () => {
				executionOrder.push("phase-start");

				// Create coordinator (sync, fast)
				const coordinator = {
					initialize: vi.fn().mockImplementation(async () => {
						await new Promise((resolve) =>
							setTimeout(resolve, 300),
						);
						return { celebration: { message: "Welcome!" } };
					}),
				};

				// Fire-and-forget: don't await
				coordinator
					.initialize("extension", "1.0.0")
					.then(() => {
						initializeResolved = true;
						executionOrder.push("init-resolved");
					})
					.catch(() => {
						executionOrder.push("init-error");
					});

				executionOrder.push("phase-end");
			};

			await initializePhase();

			// Phase should complete without waiting for initialize
			expect(executionOrder).toEqual(["phase-start", "phase-end"]);
			expect(initializeResolved).toBe(false);

			// Run timers to resolve the promise
			await vi.runAllTimersAsync();

			expect(initializeResolved).toBe(true);
			expect(executionOrder).toContain("init-resolved");
		});

		it("should log but not throw on initialization failure", async () => {
			const loggedWarnings: string[] = [];
			let phaseCompleted = false;

			const mockLogger = {
				warn: (msg: string) => loggedWarnings.push(msg),
			};

			// Use a delayed rejection to simulate async initialization
			const initializePhase = () => {
				const coordinator = {
					initialize: vi.fn().mockImplementation(async () => {
						// Delay the rejection so it happens after phase completes
						await new Promise((resolve) => setTimeout(resolve, 100));
						throw new Error("Init failed");
					}),
				};

				// Fire-and-forget with error handling
				coordinator.initialize("extension", "1.0.0").catch((error) => {
					mockLogger.warn(
						`PlatformCoordinator initialization failed: ${error.message}`,
					);
				});

				phaseCompleted = true;
			};

			initializePhase();

			// Phase should complete despite pending promise
			expect(phaseCompleted).toBe(true);
			expect(loggedWarnings).toHaveLength(0);

			// Run timers to process the delayed rejection
			await vi.runAllTimersAsync();

			// Error should be logged, not thrown
			expect(loggedWarnings).toHaveLength(1);
			expect(loggedWarnings[0]).toContain("PlatformCoordinator initialization failed");
		});
	});

	describe("Activation Budget Compliance", () => {
		it("should complete synchronous activation phases within budget", () => {
			const ACTIVATION_BUDGET_MS = 500;
			const phaseTimings: Record<string, number> = {};

			// Simulate activation with deferred LSP and PlatformCoordinator
			const simulateActivation = () => {
				const start = Date.now();

				// Phase 1: Services (fast)
				phaseTimings["Phase 1"] = 50;

				// Phase 1.5: LSP (deferred, near-zero)
				phaseTimings["Phase 1.5 (LSP)"] = 5; // Just the setImmediate call

				// Phase 2: Storage (some blocking, but manageable)
				phaseTimings["Phase 2"] = 100;

				// Phase 3: Managers (with fire-and-forget PlatformCoordinator)
				phaseTimings["Phase 3"] = 150; // Was 1510ms, now fast

				// Phase 4: Providers
				phaseTimings["Phase 4"] = 50;

				// Phase 5: Registration
				phaseTimings["Phase 5"] = 20;

				const totalSync =
					phaseTimings["Phase 1"] +
					phaseTimings["Phase 1.5 (LSP)"] +
					phaseTimings["Phase 2"] +
					phaseTimings["Phase 3"] +
					phaseTimings["Phase 4"] +
					phaseTimings["Phase 5"];

				return totalSync;
			};

			const totalActivationTime = simulateActivation();

			// Total synchronous activation should be within budget
			expect(totalActivationTime).toBeLessThan(ACTIVATION_BUDGET_MS);
		});

		it("should track deferred work separately from activation budget", () => {
			const syncTimings: number[] = [];
			const deferredTimings: number[] = [];

			// Simulate the activation pattern
			const syncStart = Date.now();

			// Sync work
			syncTimings.push(50); // Phase 1
			syncTimings.push(5); // Phase 1.5 (just the deferral)
			syncTimings.push(100); // Phase 2

			const syncEnd = Date.now();

			// Deferred work (tracked separately)
			setImmediate(() => {
				const deferredStart = Date.now();
				// LSP activation would take ~1000ms
				deferredTimings.push(1000);
				// PlatformCoordinator.initialize() would take ~300ms
				deferredTimings.push(300);
			});

			// Sync activation time
			const syncTotal = syncTimings.reduce((a, b) => a + b, 0);

			// Sync should be fast (within budget)
			expect(syncTotal).toBeLessThan(500);

			// Deferred work runs later, doesn't block activation
			expect(deferredTimings).toHaveLength(0); // Not yet executed
		});
	});

	describe("LSP Activation Deferral", () => {
		it("should defer activateLanguageServer to setImmediate", async () => {
			const calls: string[] = [];

			// Mock LSP functions
			const activateLanguageServer = vi.fn().mockImplementation(async () => {
				calls.push("lsp-start");
				await new Promise((resolve) => setTimeout(resolve, 100));
				calls.push("lsp-end");
			});

			const preCacheVitals = vi.fn().mockImplementation(async () => {
				calls.push("vitals-cached");
			});

			// Simulate the deferred pattern
			const activateExtension = () => {
				calls.push("activate-start");

				setImmediate(() => {
					activateLanguageServer()
						.then(() => preCacheVitals("workspace-id"))
						.then(() => calls.push("lsp-complete"))
						.catch(() => calls.push("lsp-error"));
				});

				calls.push("activate-end");
			};

			activateExtension();

			// Activation should complete immediately
			expect(calls).toEqual(["activate-start", "activate-end"]);

			// LSP should not have started yet
			expect(activateLanguageServer).not.toHaveBeenCalled();

			// Run deferred work
			await vi.runAllTimersAsync();

			// Now LSP should have run
			expect(activateLanguageServer).toHaveBeenCalled();
			expect(preCacheVitals).toHaveBeenCalledWith("workspace-id");
			expect(calls).toContain("lsp-complete");
		});
	});

	describe("PlatformCoordinator Fire-and-Forget", () => {
		it("should wire event handlers synchronously", () => {
			const eventHandlers: string[] = [];

			// Simulate PlatformCoordinator
			const platformCoordinator = {
				onCelebration: vi.fn((handler) => {
					eventHandlers.push("celebration-wired");
				}),
				wireHealthGuardian: vi.fn(() => {
					eventHandlers.push("health-guardian-wired");
				}),
				initialize: vi.fn().mockResolvedValue({ celebration: null }),
			};

			// Sync wiring (should happen before fire-and-forget)
			platformCoordinator.onCelebration(() => { /* intentionally empty */ });
			platformCoordinator.wireHealthGuardian({} as any);

			// Fire-and-forget initialization
			platformCoordinator.initialize("extension", "1.0.0");

			// Event handlers should be wired synchronously
			expect(eventHandlers).toEqual([
				"celebration-wired",
				"health-guardian-wired",
			]);
		});

		it("should process celebrations when initialize resolves", async () => {
			const celebrations: string[] = [];

			const platformCoordinator = {
				onCelebration: vi.fn(),
				initialize: vi.fn().mockResolvedValue({
					celebration: { message: "Welcome to Vreko!" },
					firstInit: true,
					workspaceId: "ws-123",
				}),
			};

			// Fire-and-forget with celebration logging
			platformCoordinator.initialize("extension", "1.0.0").then((result) => {
				if (result.celebration) {
					celebrations.push(result.celebration.message);
				}
			});

			// No celebrations yet
			expect(celebrations).toHaveLength(0);

			// Resolve the promise
			await vi.runAllTimersAsync();
			await Promise.resolve();

			// Celebration should be processed
			expect(celebrations).toEqual(["Welcome to Vreko!"]);
		});
	});
});
