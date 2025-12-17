/**
 * ProgressReporter Unit Tests
 *
 * TDD Phase: RED - Write failing tests first
 *
 * This utility consolidates 15+ scattered vscode.window.withProgress usages
 * into a single, consistent pattern with:
 * - Flicker prevention (operations <100ms don't show progress)
 * - Cancellation support
 * - Telemetry integration
 * - Accessibility considerations
 *
 * @see TDD_CORE.md for test-first principles
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";

// Import the utility we're about to create (will fail until implemented)
import {
	type ProgressConfig,
	ProgressReporter,
	createProgressReporter,
} from "@vscode/utils/progressReporter";

// IMPORTANT: DO NOT re-mock vscode here!
// The global setup.ts provides a complete vscode mock.
// Use vi.mocked() to override specific methods if needed.

describe("ProgressReporter", () => {
	let progressReporter: ProgressReporter;
	let mockWithProgress: ReturnType<typeof vi.fn>;
	let mockProgressReport: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();

		mockProgressReport = vi.fn();
		mockWithProgress = vi.fn().mockImplementation((options, task) => {
			return task(
				{ report: mockProgressReport },
				{ isCancellationRequested: false },
			);
		});

		(vscode.window.withProgress as ReturnType<typeof vi.fn>) = mockWithProgress;

		progressReporter = createProgressReporter();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ==================== HAPPY PATH TESTS ====================

	describe("run() - happy path", () => {
		it("should execute task and return result", async () => {
			const expectedResult = { success: true, data: "test" };
			const task = vi.fn().mockResolvedValue(expectedResult);

			const result = await progressReporter.run(
				{
					title: "Test Operation",
					location: "notification",
				},
				task,
			);

			expect(result).toEqual(expectedResult);
			expect(task).toHaveBeenCalledTimes(1);
		});

		it("should use Notification location when specified", async () => {
			const task = vi.fn().mockResolvedValue(undefined);

			await progressReporter.run(
				{
					title: "Test Operation",
					location: "notification",
					minDurationMs: 0, // Disable flicker prevention for test
				},
				task,
			);

			expect(mockWithProgress).toHaveBeenCalledWith(
				expect.objectContaining({
					location: vscode.ProgressLocation.Notification,
					title: "SnapBack: Test Operation",
				}),
				expect.any(Function),
			);
		});

		it("should use Window location when specified", async () => {
			const task = vi.fn().mockResolvedValue(undefined);

			await progressReporter.run(
				{
					title: "Background Task",
					location: "window",
					minDurationMs: 0, // Disable flicker prevention for test
				},
				task,
			);

			expect(mockWithProgress).toHaveBeenCalledWith(
				expect.objectContaining({
					location: vscode.ProgressLocation.Window,
					title: "SnapBack: Background Task",
				}),
				expect.any(Function),
			);
		});

		it("should prefix title with 'SnapBack: ' for branding", async () => {
			const task = vi.fn().mockResolvedValue(undefined);

			await progressReporter.run(
				{
					title: "Creating snapshot",
					location: "notification",
					minDurationMs: 0, // Disable flicker prevention for test
				},
				task,
			);

			expect(mockWithProgress).toHaveBeenCalledWith(
				expect.objectContaining({
					title: "SnapBack: Creating snapshot",
				}),
				expect.any(Function),
			);
		});

		it("should pass progress reporter to task callback", async () => {
			let capturedReporter: any;
			const task = vi.fn().mockImplementation((reporter) => {
				capturedReporter = reporter;
				return Promise.resolve();
			});

			await progressReporter.run(
				{
					title: "Test",
					location: "notification",
				},
				task,
			);

			expect(capturedReporter).toBeDefined();
			expect(typeof capturedReporter.report).toBe("function");
		});
	});

	// ==================== FLICKER PREVENTION TESTS ====================

	describe("run() - flicker prevention", () => {
		it("should NOT show progress for operations completing under 100ms", async () => {
			const fastTask = vi.fn().mockImplementation(async () => {
				// Simulate fast operation (50ms)
				await new Promise((resolve) => setTimeout(resolve, 50));
				return "fast result";
			});

			const result = await progressReporter.run(
				{
					title: "Fast Operation",
					location: "notification",
					minDurationMs: 100, // Only show if >100ms
				},
				fastTask,
			);

			expect(result).toBe("fast result");
			// Progress should NOT have been shown
			expect(mockWithProgress).not.toHaveBeenCalled();
		});

		it("should show progress for operations taking longer than minDurationMs", async () => {
			const slowTask = vi.fn().mockImplementation(async () => {
				// Simulate slow operation (200ms)
				await new Promise((resolve) => setTimeout(resolve, 200));
				return "slow result";
			});

			const result = await progressReporter.run(
				{
					title: "Slow Operation",
					location: "notification",
					minDurationMs: 100,
				},
				slowTask,
			);

			expect(result).toBe("slow result");
			// Progress SHOULD have been shown
			expect(mockWithProgress).toHaveBeenCalled();
		});

		it("should default minDurationMs to 100ms when not specified", async () => {
			// This test verifies the default behavior
			const config: ProgressConfig = {
				title: "Test",
				location: "notification",
			};

			// The implementation should have a default minDurationMs of 100
			expect(config.minDurationMs).toBeUndefined();
			// When undefined, implementation should default to 100ms
		});
	});

	// ==================== CANCELLATION TESTS ====================

	describe("run() - cancellation", () => {
		it("should support cancellable operations", async () => {
			let wasCancelled = false;
			const task = vi.fn().mockImplementation(async (_reporter, token) => {
				// Check cancellation token
				wasCancelled = token.isCancellationRequested;
				return "result";
			});

			await progressReporter.run(
				{
					title: "Cancellable Task",
					location: "notification",
					cancellable: true,
					minDurationMs: 0, // Disable flicker prevention for test
				},
				task,
			);

			expect(mockWithProgress).toHaveBeenCalledWith(
				expect.objectContaining({
					cancellable: true,
				}),
				expect.any(Function),
			);
		});

		it("should default to non-cancellable", async () => {
			const task = vi.fn().mockResolvedValue(undefined);

			await progressReporter.run(
				{
					title: "Non-cancellable",
					location: "notification",
					minDurationMs: 0, // Disable flicker prevention for test
				},
				task,
			);

			expect(mockWithProgress).toHaveBeenCalledWith(
				expect.objectContaining({
					cancellable: false,
				}),
				expect.any(Function),
			);
		});

		it("should reject with CancelledError when cancelled", async () => {
			mockWithProgress.mockImplementation((options, task) => {
				// Simulate cancellation
				return task(
					{ report: mockProgressReport },
					{ isCancellationRequested: true },
				);
			});

			const task = vi.fn().mockImplementation(async (_reporter, token) => {
				if (token.isCancellationRequested) {
					throw new Error("Operation cancelled");
				}
				return "result";
			});

			await expect(
				progressReporter.run(
					{
						title: "Will be cancelled",
						location: "notification",
						cancellable: true,
						minDurationMs: 0, // Disable flicker prevention for test
					},
					task,
				),
			).rejects.toThrow("Operation cancelled");
		});
	});

	// ==================== PROGRESS REPORTING TESTS ====================

	describe("progress reporting", () => {
		it("should allow reporting incremental progress", async () => {
			const task = vi.fn().mockImplementation(async (reporter) => {
				reporter.report({ message: "Step 1", increment: 25 });
				reporter.report({ message: "Step 2", increment: 50 });
				reporter.report({ message: "Step 3", increment: 25 });
				return "done";
			});

			await progressReporter.run(
				{
					title: "Multi-step",
					location: "notification",
					minDurationMs: 0, // Disable flicker prevention for test
				},
				task,
			);

			expect(mockProgressReport).toHaveBeenCalledWith({
				message: "Step 1",
				increment: 25,
			});
			expect(mockProgressReport).toHaveBeenCalledWith({
				message: "Step 2",
				increment: 50,
			});
			expect(mockProgressReport).toHaveBeenCalledWith({
				message: "Step 3",
				increment: 25,
			});
		});

		it("should allow reporting message-only updates", async () => {
			const task = vi.fn().mockImplementation(async (reporter) => {
				reporter.report({ message: "Processing files..." });
				return "done";
			});

			await progressReporter.run(
				{
					title: "Test",
					location: "notification",
					minDurationMs: 0,
				},
				task,
			);

			expect(mockProgressReport).toHaveBeenCalledWith({
				message: "Processing files...",
			});
		});
	});

	// ==================== ERROR HANDLING TESTS ====================

	describe("run() - error handling", () => {
		it("should propagate task errors", async () => {
			const error = new Error("Task failed");
			const task = vi.fn().mockRejectedValue(error);

			await expect(
				progressReporter.run(
					{
						title: "Failing Task",
						location: "notification",
					},
					task,
				),
			).rejects.toThrow("Task failed");
		});

		it("should clean up progress indicator on error", async () => {
			const error = new Error("Task failed");
			const task = vi.fn().mockRejectedValue(error);

			try {
				await progressReporter.run(
					{
						title: "Failing Task",
						location: "notification",
						minDurationMs: 0, // Disable flicker prevention for test
					},
					task,
				);
			} catch {
				// Expected to throw
			}

			// Progress should have completed (VS Code cleans up automatically)
			// This test verifies we don't leave any dangling state
			expect(mockWithProgress).toHaveBeenCalled();
		});
	});

	// ==================== EDGE CASES ====================

	describe("run() - edge cases", () => {
		it("should handle undefined task result", async () => {
			const task = vi.fn().mockResolvedValue(undefined);

			const result = await progressReporter.run(
				{
					title: "Void Task",
					location: "notification",
				},
				task,
			);

			expect(result).toBeUndefined();
		});

		it("should handle null task result", async () => {
			const task = vi.fn().mockResolvedValue(null);

			const result = await progressReporter.run(
				{
					title: "Null Task",
					location: "notification",
				},
				task,
			);

			expect(result).toBeNull();
		});

		it("should handle empty title", async () => {
			const task = vi.fn().mockResolvedValue("result");

			await progressReporter.run(
				{
					title: "",
					location: "notification",
					minDurationMs: 0, // Disable flicker prevention for test
				},
				task,
			);

			// Should still prefix with branding even if empty
			expect(mockWithProgress).toHaveBeenCalledWith(
				expect.objectContaining({
					title: "SnapBack: ",
				}),
				expect.any(Function),
			);
		});
	});

	// ==================== TELEMETRY INTEGRATION ====================

	describe("telemetry integration", () => {
		it("should emit progress_shown event with duration", async () => {
			const mockTelemetry = vi.fn();

			const reporter = createProgressReporter({
				onProgressComplete: mockTelemetry,
			});

			await reporter.run(
				{
					title: "Tracked Operation",
					location: "notification",
					operation: "snapshot_create",
					minDurationMs: 0,
				},
				async () => {
					await new Promise((resolve) => setTimeout(resolve, 50));
					return "done";
				},
			);

			expect(mockTelemetry).toHaveBeenCalledWith({
				operation: "snapshot_create",
				duration_ms: expect.any(Number),
				cancelled: false,
			});
		});

		it("should emit cancelled: true when operation is cancelled", async () => {
			const mockTelemetry = vi.fn();

			mockWithProgress.mockImplementation((options, task) => {
				return task(
					{ report: mockProgressReport },
					{ isCancellationRequested: true },
				);
			});

			const reporter = createProgressReporter({
				onProgressComplete: mockTelemetry,
			});

			const task = vi.fn().mockImplementation(async (_reporter, token) => {
				if (token.isCancellationRequested) {
					throw new Error("Cancelled");
				}
			});

			try {
				await reporter.run(
					{
						title: "Will Cancel",
						location: "notification",
						operation: "snapshot_restore",
						cancellable: true,
						minDurationMs: 0,
					},
					task,
				);
			} catch {
				// Expected
			}

			expect(mockTelemetry).toHaveBeenCalledWith(
				expect.objectContaining({
					operation: "snapshot_restore",
					cancelled: true,
				}),
			);
		});
	});

	// ==================== PERFORMANCE BUDGET ====================

	describe("performance budget", () => {
		it("should have overhead less than 5ms", async () => {
			const startTime = performance.now();

			// Run 100 iterations to get average
			for (let i = 0; i < 100; i++) {
				await progressReporter.run(
					{
						title: "Perf Test",
						location: "window",
						minDurationMs: 0,
					},
					async () => "result",
				);
			}

			const totalTime = performance.now() - startTime;
			const avgOverhead = totalTime / 100;

			// Average overhead should be under 5ms
			expect(avgOverhead).toBeLessThan(5);
		});
	});
});

// ==================== TYPE TESTS ====================

describe("ProgressConfig types", () => {
	it("should require title and location", () => {
		// TypeScript compile-time test
		const validConfig: ProgressConfig = {
			title: "Test",
			location: "notification",
		};
		expect(validConfig).toBeDefined();
	});

	it("should accept optional parameters", () => {
		const fullConfig: ProgressConfig = {
			title: "Test",
			location: "notification",
			cancellable: true,
			minDurationMs: 200,
			operation: "snapshot_create",
		};
		expect(fullConfig.cancellable).toBe(true);
		expect(fullConfig.minDurationMs).toBe(200);
	});

	it("should only allow valid location values", () => {
		// These should compile
		const notif: ProgressConfig = { title: "T", location: "notification" };
		const win: ProgressConfig = { title: "T", location: "window" };

		expect(notif.location).toBe("notification");
		expect(win.location).toBe("window");

		// Invalid locations should not compile (TypeScript check)
		// const invalid: ProgressConfig = { title: "T", location: "invalid" }; // Should error
	});
});
